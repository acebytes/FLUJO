// Logger utility
import { FEATURES } from '@/config/features';

export const LOG_LEVEL = {
  VERBOSE: -1,
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

export const CURRENT_LOG_LEVEL = 
  typeof FEATURES.LOG_LEVEL === 'number' ? FEATURES.LOG_LEVEL : LOG_LEVEL.ERROR;

/**
 * Redacts all environment variable values in a string by replacing them with their variable names
 * @param input - String or object to redact environment variables from
 * @returns The redacted string or object
 */
function redactEnvVars(input: any): any {
  // If redaction is not enabled, return the input as-is
  if (!FEATURES.REDACT_ENV_VARS_IN_LOGS) {
    return input;
  }

  // For strings, replace all env var values with their names
  if (typeof input === 'string') {
    let result = input;
    // Loop through all environment variables
    Object.entries(process.env).forEach(([key, value]) => {
      // Skip empty values or keys
      if (!value || !key) return;
      
      // Create a regular expression that will match the value globally
      // Using a RegExp constructor to allow for dynamic pattern with proper escaping
      const valueRegex = new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      
      // Replace all occurrences of the value with the key name
      result = result.replace(valueRegex, `'${key}'`);
    });
    return result;
  }
  
  // For objects, create a deep copy and redact all string values
  if (typeof input === 'object' && input !== null) {
    if (Array.isArray(input)) {
      return input.map(item => redactEnvVars(item));
    } else {
      const result = { ...input };
      for (const key in result) {
        if (Object.prototype.hasOwnProperty.call(result, key)) {
          result[key] = redactEnvVars(result[key]);
        }
      }
      return result;
    }
  }
  
  // For other types (numbers, booleans, etc.), return as-is
  return input;
}

function logWithLevel(level: number, filepath: string, message: string, data?: any, overrideLogLevel?: number) {
  const effectiveLogLevel = typeof overrideLogLevel === 'number' ? overrideLogLevel : CURRENT_LOG_LEVEL;
  
  if (level >= effectiveLogLevel) {
    const timestamp = new Date().toISOString();
    const logPrefix = `[${timestamp}] [${filepath}]`;
    
    // Redact environment variables if the feature is enabled
    const redactedMessage = redactEnvVars(message);
    let redactedData = data;
    
    if (FEATURES.REDACT_ENV_VARS_IN_LOGS && data !== undefined) {
      redactedData = redactEnvVars(data);
    }
    
    let output = `${logPrefix} ${redactedMessage}`;
    if (redactedData !== undefined) {
      if (typeof redactedData === 'object') {
        try {
          const dataStr = JSON.stringify(redactedData, null, 2);
          output += `:\n${dataStr}`;
        } catch (e) {
          output += ': [Object cannot be stringified]';
        }
      } else {
        output += `: ${redactedData}`;
      }
    }

    switch (level) {
      case LOG_LEVEL.VERBOSE:
        console.debug(`[VERBOSE] ${output}`);
        break;
      case LOG_LEVEL.DEBUG:
        console.debug(output);
        break;
      case LOG_LEVEL.INFO:
        console.info(output);
        break;
      case LOG_LEVEL.WARN:
        console.warn(output);
        break;
      case LOG_LEVEL.ERROR:
        console.error(output);
        break;
      default:
        console.log(output);
    }
  }
}



/**
 * Normalizes a file path to ensure consistent logging format
 * Removes src/ prefix if present and ensures proper formatting
 */
export function normalizeFilePath(filepath: string): string {
  // Remove src/ prefix if present
  let normalizedPath = filepath.replace(/^src\//, '');
  
  // Ensure the path has the correct format
  if (normalizedPath.startsWith('/')) {
    normalizedPath = normalizedPath.substring(1);
  }
  
  return normalizedPath;
}

/**
 * Creates a logger instance with a pre-configured file path
 * This makes it easier to use the logger consistently across the application
 * 
 * @param filepath - The file path to use for logging
 * @param overrideLogLevel - Optional parameter to override the global log level for this logger instance
 */
export function createLogger(filepath: string, overrideLogLevel?: number) {
  const normalizedPath = normalizeFilePath(filepath);
  
  return {
    verbose: (message: string, data?: any) => {
      logWithLevel(LOG_LEVEL.VERBOSE, normalizedPath, message, data, overrideLogLevel);
    },
    debug: (message: string, data?: any) => {
      logWithLevel(LOG_LEVEL.DEBUG, normalizedPath, message, data, overrideLogLevel);
    },
    info: (message: string, data?: any) => {
      logWithLevel(LOG_LEVEL.INFO, normalizedPath, message, data, overrideLogLevel);
    },
    warn: (message: string, data?: any) => {
      logWithLevel(LOG_LEVEL.WARN, normalizedPath, message, data, overrideLogLevel);
    },
    error: (message: string, data?: any) => {
      logWithLevel(LOG_LEVEL.ERROR, normalizedPath, message, data, overrideLogLevel);
    }
  };
}
