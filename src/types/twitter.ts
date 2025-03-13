import { Client } from 'twitter-api-sdk';

export type TwitterResponse = Awaited<ReturnType<Client['tweets']['usersIdTweets']>>;
export type Tweet = NonNullable<TwitterResponse['data']>[0];
export type Media = NonNullable<NonNullable<TwitterResponse['includes']>['media']>[0];

// Extend the Media type to include variants and preview_image_url
export type ExtendedMedia = Media & {
  variants?: Array<{
    bit_rate?: number;
    content_type?: string;
    url?: string;
  }>;
  preview_image_url?: string;
  url?: string;
};

export type TwitterError = {
  status: number;
  headers: {
    'x-rate-limit-limit': string;
    'x-rate-limit-remaining': string;
    'x-rate-limit-reset': string;
  };
};