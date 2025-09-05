  CREATE TABLE push_subscriptions (
      id SERIAL PRIMARY KEY,
      endpoint TEXT UNIQUE NOT NULL,
      keys_auth TEXT NOT NULL,
      keys_p256dh TEXT NOT NULL,

      -- User preferences
      cygnus_jumping BOOLEAN DEFAULT true,
      cygnus_appearing BOOLEAN DEFAULT true,
      orion_jumping BOOLEAN DEFAULT true,
      orion_appearing BOOLEAN DEFAULT true,

      -- Status tracking
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_sent TIMESTAMP,
      last_sent_success BOOLEAN,
      failed_attempts INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true
  );