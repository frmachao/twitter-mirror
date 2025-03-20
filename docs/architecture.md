## 系统架构

Twitter Mirror 是一个自动化的推文监控、翻译和发布系统。系统采用事件驱动架构，通过事件总线实现服务间的解耦和协作。

### 架构图

```mermaid
graph TB
    subgraph 配置管理
    Config[配置文件<br/>- API密钥<br/>- 目标用户<br/>- 监控间隔]
    end

    subgraph 监控服务集群
    Monitor[监控服务实例集群<br/>每用户一个实例<br/>Cron任务15分钟/次]
    TwitterClient[Twitter客户端实例集群<br/>- API调用封装<br/>- 限流处理]
    ProcessState[状态管理<br/>ProcessState表<br/>- targetUserId<br/>- lastTweetId]
    end

    subgraph 事件总线
    EventBus[事件总线单例<br/>- MONITOR_COMPLETED<br/>- ANALYSIS_COMPLETED<br/>- TRANSLATION_COMPLETED]
    end

    subgraph 数据处理
    ThreadAnalyzer[线程分析器单例<br/>- 会话关系分析<br/>- 线程状态管理]
    Translator[翻译服务单例<br/>- 多翻译提供商<br/>- 工厂模式]
    DB[(数据库<br/>Tweet表<br/>Thread表)]
    end

    subgraph 翻译任务队列
    TranslationQueue[翻译队列<br/>- 并发数:1<br/>- 最大重试:3]
    TranslationProcessor[翻译处理器]
    end

    subgraph 发布任务队列
    PublishQueue[发布队列集群<br/>- 每用户一个队列<br/>- 并发数:1<br/>- 无重试]
    PublishProcessor[发布处理器集群]
    end

    subgraph 发布服务集群
    Publishers[发布服务实例集群<br/>每用户一个实例]
    MediaHandler[媒体处理器<br/>- 图片上传<br/>- 视频URL处理]
    RateLimitHandler[发布限流处理]
    end

    Config --> Monitor
    Monitor --> TwitterClient
    TwitterClient --> ProcessState
    ProcessState --> DB
    
    Monitor -- MONITOR_COMPLETED --> EventBus
    DB --> ThreadAnalyzer
    ThreadAnalyzer -- ANALYSIS_COMPLETED --> EventBus
    EventBus --> Translator
    
    Translator --> TranslationQueue
    TranslationQueue --> TranslationProcessor
    TranslationProcessor -- TRANSLATION_COMPLETED --> EventBus
    
    EventBus --> Publishers
    Publishers --> PublishQueue
    PublishQueue --> PublishProcessor
    PublishProcessor --> MediaHandler
    PublishProcessor --> RateLimitHandler
    MediaHandler --> DB

    classDef config fill:#f9f,stroke:#333
    classDef monitor fill:#bbf,stroke:#333
    classDef eventbus fill:#ff9,stroke:#333
    classDef process fill:#bfb,stroke:#333
    classDef queue fill:#fbf,stroke:#333
    classDef publish fill:#fbb,stroke:#333
    
    class Config config
    class Monitor,TwitterClient,ProcessState monitor
    class EventBus eventbus
    class ThreadAnalyzer,Translator,DB process
    class TranslationQueue,PublishQueue,TranslationProcessor,PublishProcessor queue
    class Publishers,MediaHandler,RateLimitHandler publish
```

### 核心组件

1. **监控服务 (Monitor)**
   - 唯一保留Cron任务的服务，每15分钟执行一次
   - 负责获取目标用户的最新推文
   - 包含限流处理机制，支持429错误的优雅恢复
   - 使用ProcessState表跟踪每个目标用户的最后处理状态
   - 发送MONITOR_COMPLETED事件

2. **Twitter客户端 (TwitterClient)**
   - 封装Twitter API调用
   - 处理API认证和限流
   - 支持媒体上传和推文发布
   - 统一的错误处理机制

3. **事件总线 (EventBus)**
   - 系统的核心协调组件
   - 支持的关键事件：
     - MONITOR_COMPLETED: 监控完成
     - ANALYSIS_COMPLETED: 线程分析完成
     - TRANSLATION_COMPLETED: 翻译完成
   - 实现服务间的解耦和异步通信

4. **线程分析器 (ThreadAnalyzer)**
   - 分析推文之间的会话关系
   - 构建完整的推文线程
   - 事件驱动，不再使用定时任务
   - 发送ANALYSIS_COMPLETED事件
   - 支持批量处理线程状态更新

5. **翻译服务 (Translator)**
   - 支持多翻译提供商（工厂模式）
   - 当前支持Moonshot API
   - 可扩展支持其他翻译服务
   - 通过任务队列处理翻译请求
   - 发送TRANSLATION_COMPLETED事件

6. **任务队列 (TaskQueue)**
   - 统一的任务处理机制
   - 支持并发控制
   - 内置重试机制
   - 处理器：
     - TranslationProcessor: 处理翻译任务
   - 支持任务状态追踪

7. **发布服务 (Publisher)**
   - 每个目标用户独立的发布服务实例
   - 监听TRANSLATION_COMPLETED事件
   - 通过任务队列处理发布请求
   - 支持媒体处理：
     - 图片：直接上传到Twitter
     - 视频：将URL添加到推文文本
   - 包含限流处理机制，支持429错误的自动重试

8. **数据存储**
   - Thread表：管理推文线程
   - Tweet表：存储推文内容和翻译
   - ProcessState表：记录每个目标用户的处理状态

### 工作流程

1. Monitor服务定期检查新推文
2. TwitterClient获取推文并处理限流
3. ThreadAnalyzer分析并构建线程
4. 通过事件触发翻译服务
5. 翻译任务进入任务队列
6. TranslationProcessor处理翻译
7. 翻译完成后触发对应的发布服务
8. 发布任务进入任务队列
9. PublishProcessor处理发布，包括媒体处理

### 错误处理

1. **限流处理**
   - TwitterClient统一处理API限流
   - 基于响应头的reset time进行等待
   - 自动重试机制

2. **任务重试**
   - 任务队列内置重试机制
   - 支持配置重试次数和间隔
   - 失败任务状态追踪

3. **状态管理**
   - 完整的状态转换验证
   - 失败状态的记录和恢复
   - 支持手动触发重试

### 辅助工具

1. **重试脚本**
   - retry-failed-tweets.ts: 重试失败的推文发布
   - trigger-translation.ts: 手动触发翻译流程

2. **监控工具**
   - 完整的日志系统
   - 状态追踪
   - 错误报告 