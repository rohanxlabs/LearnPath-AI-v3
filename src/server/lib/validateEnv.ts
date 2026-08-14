// Environment variable validation — fail fast on startup with clear messages.
// This prevents silent misconfigurations that only surface at runtime after
// deployment, potentially causing partial outages or data integrity issues.

import { logger } from './logger';

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates all required environment variables are present and well-formed.
 * Returns a detailed validation result with errors and warnings.
 */
export function validateEnvironment(): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';

  // Skip validation in test mode — tests use mock/placeholder values
  if (isTest) {
    return { valid: true, errors: [], warnings: [] };
  }

  // ---------------------------------------------------------------------------
  // CRITICAL — Server cannot start without these
  // ---------------------------------------------------------------------------

  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is required. Set it to your PostgreSQL connection string.');
  } else {
    // Validate DATABASE_URL format
    try {
      const url = new URL(process.env.DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
        errors.push('DATABASE_URL must start with postgres:// or postgresql://');
      }
    } catch {
      errors.push('DATABASE_URL is not a valid URL');
    }
  }

  if (!process.env.GROQ_API_KEY) {
    errors.push('GROQ_API_KEY is required. Get one at https://console.groq.com/keys');
  } else if (!process.env.GROQ_API_KEY.startsWith('gsk_')) {
    warnings.push('GROQ_API_KEY does not start with "gsk_" — ensure it is a valid Groq API key');
  }

  if (!process.env.SUPABASE_URL) {
    errors.push('SUPABASE_URL is required. Find it in your Supabase project settings → API');
  } else if (!process.env.SUPABASE_URL.includes('supabase.co')) {
    warnings.push('SUPABASE_URL does not contain "supabase.co" — ensure it is correct');
  }

  if (!process.env.SUPABASE_ANON_KEY) {
    errors.push('SUPABASE_ANON_KEY is required. Find it in your Supabase project settings → API');
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY is required (server-only). Find it in Supabase project settings → API');
  }

  // SUPABASE_JWT_SECRET is only required for HS256 projects (older Supabase).
  // ES256 projects (newer) fetch the public key via JWKS automatically.
  // We can't detect which algorithm the project uses without decoding a token,
  // so we only warn if missing, not error.
  if (!process.env.SUPABASE_JWT_SECRET) {
    warnings.push(
      'SUPABASE_JWT_SECRET is not set. This is only required for older Supabase projects using HS256 tokens. ' +
      'Newer projects (ES256) do not need this variable. If auth fails, set it from Supabase → Settings → API → JWT Secret.'
    );
  }

  // ---------------------------------------------------------------------------
  // PRODUCTION-CRITICAL — Required in production for security/functionality
  // ---------------------------------------------------------------------------

  if (isProduction) {
    if (!process.env.FRONTEND_URL) {
      errors.push(
        'FRONTEND_URL is required in production for CORS to work. ' +
        'Set it to your public service URL (e.g., https://learnpath-ai.onrender.com)'
      );
    }

    if (!process.env.REDIS_URL) {
      warnings.push(
        '⚠️  REDIS_URL is not set in production. Auth rate-limiting will be per-instance only. ' +
        'For multi-instance deployments, set REDIS_URL to an Upstash Redis URL to enable shared rate-limiting. ' +
        'Single-instance deployments can ignore this warning.'
      );
    }

    if (!process.env.SENTRY_DSN && !process.env.VITE_SENTRY_DSN) {
      warnings.push(
        'SENTRY_DSN and VITE_SENTRY_DSN are not set. Error tracking is disabled. ' +
        'Set these to enable production error monitoring.'
      );
    }
  }

  // ---------------------------------------------------------------------------
  // RECOMMENDED — Important for production quality but not blocking
  // ---------------------------------------------------------------------------

  if (!process.env.RESEND_API_KEY && !process.env.EMAIL_FROM) {
    warnings.push(
      'RESEND_API_KEY and EMAIL_FROM are not set. Email features (password reset, verification) ' +
      'will use Supabase\'s default rate-limited SMTP. Configure a custom SMTP provider for production.'
    );
  }

  if (process.env.RESEND_API_KEY && !process.env.EMAIL_FROM) {
    warnings.push('RESEND_API_KEY is set but EMAIL_FROM is missing. Email sending will fail.');
  }

  if (!process.env.YOUTUBE_API_KEY) {
    warnings.push(
      'YOUTUBE_API_KEY is not set. Video recommendations will use fallback YouTube search links ' +
      'instead of embedded videos.'
    );
  }

  // ---------------------------------------------------------------------------
  // NUMERIC VALIDATION — Ensure values are valid numbers if set
  // ---------------------------------------------------------------------------

  if (process.env.PORT && isNaN(Number(process.env.PORT))) {
    errors.push(`PORT must be a number, got: ${process.env.PORT}`);
  }

  if (process.env.AI_DAILY_LIMIT && isNaN(Number(process.env.AI_DAILY_LIMIT))) {
    errors.push(`AI_DAILY_LIMIT must be a number, got: ${process.env.AI_DAILY_LIMIT}`);
  }

  if (process.env.DATABASE_POOL_MAX && isNaN(Number(process.env.DATABASE_POOL_MAX))) {
    errors.push(`DATABASE_POOL_MAX must be a number, got: ${process.env.DATABASE_POOL_MAX}`);
  }

  // ---------------------------------------------------------------------------
  // VITE FRONTEND VARIABLES — Must match server-side values
  // ---------------------------------------------------------------------------

  if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_URL !== process.env.SUPABASE_URL) {
    warnings.push(
      'VITE_SUPABASE_URL does not match SUPABASE_URL. These should be identical. ' +
      'The VITE_ prefix exposes the value to the browser.'
    );
  }

  if (process.env.VITE_SUPABASE_ANON_KEY && process.env.VITE_SUPABASE_ANON_KEY !== process.env.SUPABASE_ANON_KEY) {
    warnings.push(
      'VITE_SUPABASE_ANON_KEY does not match SUPABASE_ANON_KEY. These should be identical.'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates environment variables and logs results.
 * Exits the process with code 1 if critical errors are found.
 * This should be called at the very top of server.ts, before any other imports
 * that might depend on environment variables.
 */
export function validateEnvironmentOrExit(): void {
  const result = validateEnvironment();

  if (result.warnings.length > 0) {
    result.warnings.forEach((warning) => {
      logger.warn(`[EnvValidation] ${warning}`);
    });
  }

  if (!result.valid) {
    logger.fatal({ errors: result.errors }, '[EnvValidation] Environment validation failed');
    console.error('\n❌ Environment validation failed:\n');
    result.errors.forEach((error, i) => {
      console.error(`  ${i + 1}. ${error}`);
    });
    console.error('\nFix these errors in your .env file and restart the server.\n');
    process.exit(1);
  }

  if (result.warnings.length === 0 && result.errors.length === 0) {
    logger.info('[EnvValidation] ✓ All environment variables validated successfully');
  } else if (result.warnings.length > 0 && result.errors.length === 0) {
    logger.info(
      { warningCount: result.warnings.length },
      '[EnvValidation] ✓ Environment validation passed with warnings (see above)'
    );
  }
}
