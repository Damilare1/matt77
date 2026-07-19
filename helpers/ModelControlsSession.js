import Session from "./Session.js";

export default class ModelControlsSession extends Session {
    getCreateSessionParams(key) {
        return {
            Item: {
                SessionKey: key,
                model: '',
                max_token: 0,
                maximum_tokens: 0,
                tokens_left: 0,
                tokens_used: {},
                tokens_reset_month: '',
                video_seconds_used: {},
                videos_used: 0,
                maximum_videos: 10,
                context: '',
                prevResponses: '',
                voice_prompts: false,
                image_model: '',
                video_model: '',
                audio_model: ''
            }
        }
    }

    getSaveSessionParams(key, session = {}) {
        const { model, max_token, maximum_tokens, tokens_left, tokens_used, tokens_reset_month, video_seconds_used, videos_used, maximum_videos, context, prevResponses, voice_prompts, image_model, video_model, audio_model } = session

        const params = {
            ExpressionAttributeNames: {
                "#MO": "model",
                "#MT": "max_token",
                "#MX": "maximum_tokens",
                "#TL": "tokens_left",
                "#TU": "tokens_used",
                "#TR": "tokens_reset_month",
                "#VS": "video_seconds_used",
                "#VU": "videos_used",
                "#MV": "maximum_videos",
                "#CO": "context",
                "#PR": "prevResponses",
                "#VP": "voice_prompts",
                "#IM": "image_model",
                "#VM": "video_model",
                "#AM": "audio_model",
            },
            Key: {
                SessionKey: key
            },
            UpdateExpression: 'set #MO = :m1, #MT = :m2, #MX = :mx, #TL = :t1, #TU = :t2, #TR = :tr, #VS = :vs, #VU = :vu, #MV = :mv, #CO = :c1, #PR = :p1, #VP = :v1, #IM = :im, #VM = :vm, #AM = :am',
            ExpressionAttributeValues: {
                ':m1': model,
                ':m2': max_token,
                ':mx': maximum_tokens || 0,
                ':t1': tokens_left,
                ':t2': tokens_used,
                ':tr': tokens_reset_month || '',
                ':vs': video_seconds_used || {},
                ':vu': videos_used || 0,
                ':mv': maximum_videos || 10,
                ':c1': context,
                ':p1': prevResponses,
                ':v1': voice_prompts,
                ':im': image_model || '',
                ':vm': video_model || '',
                ':am': audio_model || ''
            }
        };

        if (this.options.ttl > -1) {
            params.ExpressionAttributeNames["#T"] = "ttl";
            params.UpdateExpression += ', #T = :t'
            params.ExpressionAttributeValues[':t'] = Math.floor(Date.now() / 1000) + this.options.ttl * 60
        }
        return params;
    }
}
