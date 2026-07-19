import 'dotenv/config'
import ids from './ids.yml'
import availableModels from './models.yml'

const __dirname = process.cwd();

const { allowed } = ids;
const { TELEGRAM_BOT_TOKEN, OPEN_AI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY, DYNAMODB_ACCESS_KEY, DYNAMODB_SECRET_ACCESS_KEY, DYNAMODB_REGION, IS_SERVERLESS, FUNCTION_URL, GOOGLE_SERVICE_ACCOUNT_KEY_PATH, GOOGLE_CALENDAR_ID, BRAVE_API_KEY, ADMIN_CHAT_ID } = process.env;
const { models, audio_models: audioModels, image_models: imageModels, video_models: videoModels } = availableModels

export default {
  'allowedIds': allowed,
  'TELEGRAM_TOKEN': TELEGRAM_BOT_TOKEN, 
  'AI_KEY': OPEN_AI_API_KEY,
  'DYNAMODB_REGION': DYNAMODB_REGION,
  'DYNAMODB_SECRET_ACCESS_KEY': DYNAMODB_SECRET_ACCESS_KEY,
  'DYNAMODB_ACCESS_KEY': DYNAMODB_ACCESS_KEY,
  'IS_SERVERLESS': IS_SERVERLESS,
  'FUNCTION_URL': FUNCTION_URL,
  'GOOGLE_SERVICE_ACCOUNT_KEY_PATH': GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
  'GOOGLE_CALENDAR_ID': GOOGLE_CALENDAR_ID,
  'BRAVE_API_KEY': BRAVE_API_KEY,
  'ANTHROPIC_API_KEY': ANTHROPIC_API_KEY,
  'GOOGLE_AI_API_KEY': GOOGLE_AI_API_KEY,
  'ADMIN_CHAT_ID': ADMIN_CHAT_ID,
  models,
  audioModels,
  imageModels,
  videoModels,
  dirname: __dirname
}