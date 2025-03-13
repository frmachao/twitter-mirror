import { Logger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';

export class Database {
  private static instance: Database;
  private prisma: PrismaClient;
  private logger: Logger;

  private constructor() {
    this.logger = new Logger('Database');
    this.prisma = new PrismaClient();
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public async connect(): Promise<void> {
    try {
      await this.prisma.$connect();
      this.logger.info('Database connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to database:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      this.logger.info('Database disconnected successfully');
    } catch (error) {
      this.logger.error('Failed to disconnect from database:', error);
      throw error;
    }
  }

  public getPrisma(): PrismaClient {
    return this.prisma;
  }
} 