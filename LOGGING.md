# Logging Guide

This application uses [Pino](https://getpino.io/) for high-performance structured logging.

## Configuration

### Environment Variables

Set the log level using the `LOG_LEVEL` environment variable:

```bash
LOG_LEVEL=debug
```

Available log levels (in order of priority):
- `fatal` (60) - The service/app is going to stop or become unusable
- `error` (50) - An error occurred that might impact functionality
- `warn` (40) - Warning that needs attention but doesn't stop the app
- `info` (30) - General informational messages
- `debug` (20) - Debug information for troubleshooting
- `trace` (10) - Very detailed tracing information

### Development vs Production

**Development Mode:**
- Uses `pino-pretty` for human-readable colored output
- Default level: `debug`
- Shows timestamps in `HH:MM:ss Z` format
- Ignores `pid` and `hostname` for cleaner output

**Production Mode:**
- Uses structured JSON output for log aggregation
- Default level: `info`
- Includes full ISO timestamps
- Redacts sensitive information (passwords, tokens, cookies)

## Usage

### Importing the Logger

```typescript
import { logger, createChildLogger } from '../config/logger';

// Use main logger
logger.info('Server starting');

// Create child logger for specific service/controller
const serviceLogger = createChildLogger('UserService');
serviceLogger.debug('Processing user request', { userId: '123' });
```

### Log Levels Usage

```typescript
// Fatal - service stopping
logger.fatal({ err: error }, 'Database connection failed permanently');

// Error - something went wrong
logger.error({ err: error, userId }, 'Failed to create user');

// Warn - something suspicious
logger.warn({ requestCount: 1000 }, 'High request rate detected');

// Info - general information
logger.info('User logged in successfully', { userId: '123' });

// Debug - debugging information
logger.debug('Cache miss', { key: 'user:123' });

// Trace - very detailed information
logger.trace('Function entry', { args: { id: '123' } });
```

### Structured Logging

Always use structured logging with relevant context:

```typescript
// Good - structured with context
logger.info('Project created', {
  projectId: project.id,
  userId: req.user.id,
  title: project.title,
  targetAmount: project.targetAmount
});

// Avoid - unstructured string concatenation
logger.info(`Project ${project.id} created by ${req.user.id}`);
```

### Error Logging

When logging errors, include the error object and relevant context:

```typescript
try {
  // some operation
} catch (error) {
  logger.error({
    err: error,
    userId: req.user?.id,
    operation: 'createProject',
    projectData: req.body
  }, 'Failed to create project');
  
  res.status(500).json({ message: 'Internal server error' });
}
```

### Child Loggers

Create child loggers for different services/controllers to organize logs:

```typescript
// In controller files
const logger = createChildLogger('ProjectController');

// In service files  
const logger = createChildLogger('EmailService');

// Logs will include service: 'ProjectController' in the output
logger.info('Processing request', { projectId: '123' });
```

## HTTP Request Logging

The application automatically logs all HTTP requests with:
- Request method, URL, headers (sensitive headers redacted)
- Response status code and headers
- Response time
- Custom log levels based on status codes:
  - 4xx responses: `warn` level
  - 5xx responses: `error` level
  - 3xx responses: `silent` (not logged)
  - 2xx responses: `info` level

## Security

In production mode, sensitive information is automatically redacted:
- Authorization headers
- Cookie headers
- Password fields in request bodies
- Token fields
- Set-Cookie response headers

## Log Output Examples

### Development (Pretty Print)
```
[14:30:25.123] INFO (ProjectController): Project created
    projectId: "abc-123"
    userId: "user-456"
    title: "Community Garden Project"
```

### Production (JSON)
```json
{
  "level": "info",
  "timestamp": "2025-01-15T14:30:25.123Z",
  "service": "ProjectController",
  "msg": "Project created",
  "projectId": "abc-123",
  "userId": "user-456",
  "title": "Community Garden Project"
}
```

## Log Analysis

In production, you can use tools like:
- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Grafana Loki**
- **Datadog**
- **New Relic**

All logs are in structured JSON format making them easy to query and analyze.

## Performance

Pino is designed for high performance:
- Asynchronous logging
- Minimal overhead
- JSON serialization optimizations
- Child logger reuse

The logger has negligible impact on application performance even at high throughput.