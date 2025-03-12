export interface TwitterApiError extends Error {
  status?: number;
  headers?: {
    'x-rate-limit-reset'?: string;
  };
}

export interface MediaVariant {
  bit_rate?: number;
  content_type: string;
  url: string;
}

export interface TwitterMedia {
  height?: number;
  media_key?: string;
  type: string;
  width?: number;
  preview_image_url?: string;
  variants?: MediaVariant[];
}

export interface TwitterMediaEntity extends TwitterMedia {
  media_key: string;
  type: 'photo' | 'video' | 'animated_gif';
}

export interface TwitterAttachments {
  media_keys?: string[];
  poll_ids?: string[];
}

export interface Tweet {
  id: string;
  text: string;
  author_id?: string;
  username?: string;
  created_at?: string;
  conversation_id?: string;
  in_reply_to_user_id?: string;
  attachments?: TwitterAttachments;
}

export interface TwitterGeo {
  bbox?: number[];
  geometry?: {
    coordinates: number[];
    type: string;
  };
  properties?: Record<string, unknown>;
  type?: string;
}

export interface TwitterPlace {
  contained_within?: string[];
  country?: string;
  country_code?: string;
  full_name?: string;
  geo?: TwitterGeo;
  id: string;
  name?: string;
  place_type?: string;
}

export interface TwitterPollOption {
  label: string;
  position: number;
  votes: number;
}

export interface TwitterPoll {
  duration_minutes: number;
  end_datetime: string;
  id: string;
  options: TwitterPollOption[];
  voting_status: string;
}

export interface TwitterTopic {
  description?: string;
  id: string;
  name: string;
}

export interface TwitterUser {
  created_at?: string;
  id: string;
  name?: string;
  protected?: boolean;
  username: string;
}

export interface TwitterPaginatedResponse<T> {
  data: T[];
  includes?: {
    media?: TwitterMedia[];
    places?: TwitterPlace[];
    polls?: TwitterPoll[];
    topics?: TwitterTopic[];
    tweets?: Tweet[];
    users?: TwitterUser[];
  };
  meta?: {
    newest_id?: string;
    next_token?: string;
    oldest_id?: string;
    previous_token?: string;
    result_count?: number;
  };
  errors?: {
    detail: string;
    status: number;
    title: string;
    type: string;
  }[];
} 