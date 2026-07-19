import fs from 'fs'
import { Jimp } from 'jimp';
import jpeg from 'jpeg-js';
import { deleteFile } from './fileDownloader.js';
import { aiImageEditAssistant, aiImageGenerationAssistant } from '../AiApi/images.js';
import { aiVideoGenerationAssistant, aiVideoGenerationFromImageAssistant, aiVideoGenerationStatus } from '../AiApi/video.js';
import {
    createCalendarEvent as apiCreateEvent,
    listCalendarEvents as apiListEvents,
    updateCalendarEvent as apiUpdateEvent,
    deleteCalendarEvent as apiDeleteEvent
} from '../GoogleApi/calendar.js';
import config from '../config/config.js';


// fetch() does not support data: URIs in Node.js — parse them directly instead.
const getImageBuffer = async (url) => {
    if (url?.startsWith('data:')) {
        const base64Data = url.split(',')[1];
        return Buffer.from(base64Data, 'base64');
    }
    const res = await fetch(url);
    return Buffer.from(await res.arrayBuffer());
};

const write_code_to_file = async (content, fileName, actions) => {
    const directoryPath = '/tmp'
    const filePath = directoryPath + '/' + fileName;
    await actions.response_action("Writing code into a file");
    await actions.chat_action('upload_document', saveDocument(directoryPath, fileName, content, actions, filePath))
    return `File with name ${fileName} was shared with the user`
}

const generate_image = async (_, __, actions) => {
    try {
        await actions.response_action("Generating images");
        const { response, usage } = await aiImageGenerationAssistant(actions.prompt, actions.image_model)
        await actions.send_photo(actions.chat_id, { source: Buffer.from(response) }, { caption: actions.file_name })
        actions.track_image_usage?.(usage, actions.image_model);
        return `Photo with name ${actions.file_name} was shared with the user`
    } catch (e) {
        return handleApiError({ e, fallback_message: `Unable to generate image, please try again later.` })
    }
}

const edit_image = async (_, __, actions) => {
    try {
        await actions.response_action("Editing images");
        const imageBuffer = await getImageBuffer(actions.base_image_url);
        const decoded = jpeg.decode(imageBuffer, { useTArray: true });
        const image = Jimp.fromBitmap({ data: decoded.data, width: decoded.width, height: decoded.height });
        image.cover({ w: 1024, h: 1024 });
        const processedBuffer = await image.getBuffer('image/png');
        const fileFromBuffer = new File([processedBuffer], 'photo.png', { type: 'image/png' });
        const { response, usage } = await aiImageEditAssistant(fileFromBuffer, actions.prompt, actions.image_model)
        await actions.send_photo(actions.chat_id, { source: Buffer.from(response) }, { caption: actions.file_name })
        actions.track_image_usage?.(usage, actions.image_model);
        return `Photo with name ${actions.file_name} was shared with the user`
    } catch (e) {
        return handleApiError({ e, fallback_message: `Unable to edit image, please try again later.` })
    }
}

const generate_video = async (_, __, actions) => {
    if (!actions.can_generate_video?.()) {
        return "You have reached your monthly video generation limit. It will reset next month.";
    }
    try {
        const seconds = Number(actions.seconds ?? 4);
        const videoModel = actions.video_model ?? 'sora-2';
        const response = await aiVideoGenerationAssistant(actions.prompt, String(seconds), actions.size ?? "720x1280", videoModel, actions.from_id ?? "")
        await actions.response_action(`Your video generation request is being processed. Here is your video request ID: ${response['id']}. You can use this ID to inquire about the status of your video at any time.`);
        actions.track_video_seconds?.(seconds, videoModel);
        console.log("Received response", response)
        return JSON.stringify(response);
    } catch (e) {
        return handleApiError({ e, fallback_message: `Unable to generate video, please try again later.` })
    }
}

const generate_video_from_image = async (_, __, actions) => {
    if (!actions.can_generate_video?.()) {
        return "You have reached your monthly video generation limit. It will reset next month.";
    }
    try {
        const size = actions.size ?? "720x1280";
        const seconds = Number(actions.seconds ?? 4);
        const videoModel = actions.video_model ?? 'sora-2';
        const [width, height] = size.split('x').map(Number);
        const imageBuffer = await getImageBuffer(actions.base_image_url);
        const decoded = jpeg.decode(imageBuffer, { useTArray: true });
        const image = Jimp.fromBitmap({ data: decoded.data, width: decoded.width, height: decoded.height });
        image.cover({ w: width, h: height });
        const processedBuffer = await image.getBuffer('image/png');
        const fileFromBuffer = new File([processedBuffer], 'photo.png', { type: 'image/png' });

        const response = await aiVideoGenerationFromImageAssistant(fileFromBuffer, actions.prompt, String(seconds), size, videoModel, actions.from_id ?? "")
        await actions.response_action(`Your video generation request is being processed. Here is your video request ID: ${response['id']}. You can use this ID to inquire about the status of your video at any time.`);
        actions.track_video_seconds?.(seconds, videoModel);
        console.log("Received response", response)
        return JSON.stringify(response);
    } catch (e) {
        console.error("Api Error thrown", e)
        return handleApiError({ e, fallback_message: `Unable to generate video, please try again later.` })
    }
}

const handleApiError = async ({ e, fallback_message }) => {
    console.error("Api Error", e)
    if (e.status === 404 || e.status === 400) {
        return `${e.error.type}: ${e.error.message}`
    }
    return fallback_message ?? "Unable to complete request, please try again later"
}

const get_video_status = async (_, __, actions) => {
    try {
        const { progress, status, video_uri } = await aiVideoGenerationStatus(actions.request_id);
        return JSON.stringify({ progress: `${progress}%`, status, ...(video_uri ? { video_uri } : {}) })
    } catch (e) {
        return handleApiError({ e, fallback_message: `Unable to fetch details for video with ID: ${actions.request_id}, please try again later.` })
    }
}

function saveDocument(directoryPath, fileName, content, actions, filePath) {
    return () => {
        // Create the directory if it doesn't exist
        fs.mkdir(directoryPath, { recursive: true }, (err) => {
            if (err) {
                console.error('Error creating directory:', err);
                return;
            }

            // Write the file to the specified directory
            fs.writeFile(directoryPath + '/' + fileName, content, (err) => {
                if (err) {
                    console.error('Error writing file:', err);
                } else {
                    console.log('File saved successfully in:', filePath);
                    console.log('Calling document_action with', filePath, fileName);

                    actions.document_action(actions.from_id, {
                        source: filePath,
                        filename: fileName
                    }).then(() => deleteFile(filePath).then((d) => console.log("deleted")).catch(e => { throw e })).catch(function (error) { console.log(error); });
                }
            });

        });
    };
}

const create_calendar_event = async (_, __, actions) => {
    try {
        await actions.response_action("Creating calendar event...");
        const event = await apiCreateEvent({
            title: actions.title,
            description: actions.description,
            start_time: actions.start_time,
            end_time: actions.end_time,
            location: actions.location,
            timezone: actions.timezone,
        });
        return JSON.stringify({
            success: true,
            event_id: event.id,
            title: event.summary,
            start: event.start,
            end: event.end,
            link: event.htmlLink,
        });
    } catch (e) {
        return handleApiError({ e, fallback_message: "Failed to create calendar event. Please try again later." });
    }
};

const list_calendar_events = async (_, __, actions) => {
    try {
        const events = await apiListEvents({
            time_min: actions.time_min,
            time_max: actions.time_max,
            max_results: actions.max_results,
        });
        const formatted = events.map(e => ({
            event_id: e.id,
            title: e.summary,
            start: e.start?.dateTime || e.start?.date,
            end: e.end?.dateTime || e.end?.date,
            location: e.location || '',
            description: e.description || '',
        }));
        return JSON.stringify({ success: true, count: formatted.length, events: formatted });
    } catch (e) {
        return handleApiError({ e, fallback_message: "Failed to list calendar events. Please try again later." });
    }
};

const update_calendar_event = async (_, __, actions) => {
    try {
        await actions.response_action("Updating calendar event...");
        const event = await apiUpdateEvent({
            event_id: actions.event_id,
            title: actions.title,
            description: actions.description,
            start_time: actions.start_time,
            end_time: actions.end_time,
            location: actions.location,
            timezone: actions.timezone,
        });
        return JSON.stringify({
            success: true,
            event_id: event.id,
            title: event.summary,
            start: event.start,
            end: event.end,
        });
    } catch (e) {
        return handleApiError({ e, fallback_message: "Failed to update calendar event. Please try again later." });
    }
};

const delete_calendar_event = async (_, __, actions) => {
    try {
        await actions.response_action("Deleting calendar event...");
        await apiDeleteEvent({ event_id: actions.event_id });
        return JSON.stringify({ success: true, message: `Event ${actions.event_id} deleted successfully.` });
    } catch (e) {
        return handleApiError({ e, fallback_message: "Failed to delete calendar event. Please try again later." });
    }
};

const brave_web_search = async (_, __, actions) => {
    try {
        const query = encodeURIComponent(actions.query);
        const count = actions.count ?? 5;
        const url = `https://api.search.brave.com/res/v1/web/search?q=${query}&count=${count}`;
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'X-Subscription-Token': config.BRAVE_API_KEY
            }
        });
        const data = await response.json();
        if (!data.web?.results?.length) {
            return 'No results found.';
        }
        return data.web.results.slice(0, count).map(r =>
            `Title: ${r.title}\nURL: ${r.url}\nDescription: ${r.description || ''}`
        ).join('\n\n');
    } catch (e) {
        return `Search failed: ${e.message}`;
    }
};

export default {
    write_code_to_file,
    generate_image,
    edit_image,
    generate_video,
    generate_video_from_image,
    get_video_status,
    create_calendar_event,
    list_calendar_events,
    update_calendar_event,
    delete_calendar_event,
    brave_web_search,
}
