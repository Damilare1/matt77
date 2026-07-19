import { google } from 'googleapis';
import config from '../config/config.js';

const { GOOGLE_SERVICE_ACCOUNT_KEY_PATH, GOOGLE_CALENDAR_ID } = config;
const calendarId = GOOGLE_CALENDAR_ID || 'primary';

const getCalendarClient = () => {
    const auth = new google.auth.GoogleAuth({
        keyFile: GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
        scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    return google.calendar({ version: 'v3', auth });
};

export const createCalendarEvent = async ({ title, description, start_time, end_time, location, timezone }) => {
    const calendar = getCalendarClient();
    const event = {
        summary: title,
        description: description || '',
        location: location || '',
        start: {
            dateTime: start_time,
            timeZone: timezone || 'UTC',
        },
        end: {
            dateTime: end_time,
            timeZone: timezone || 'UTC',
        },
    };
    const response = await calendar.events.insert({
        calendarId,
        resource: event,
    });
    return response.data;
};

export const listCalendarEvents = async ({ time_min, time_max, max_results }) => {
    const calendar = getCalendarClient();
    const response = await calendar.events.list({
        calendarId,
        timeMin: time_min || new Date().toISOString(),
        timeMax: time_max || undefined,
        maxResults: max_results || 10,
        singleEvents: true,
        orderBy: 'startTime',
    });
    return response.data.items || [];
};

export const updateCalendarEvent = async ({ event_id, title, description, start_time, end_time, location, timezone }) => {
    const calendar = getCalendarClient();
    const resource = {};
    if (title) resource.summary = title;
    if (description) resource.description = description;
    if (location) resource.location = location;
    if (start_time) resource.start = { dateTime: start_time, timeZone: timezone || 'UTC' };
    if (end_time) resource.end = { dateTime: end_time, timeZone: timezone || 'UTC' };

    const response = await calendar.events.patch({
        calendarId,
        eventId: event_id,
        resource,
    });
    return response.data;
};

export const deleteCalendarEvent = async ({ event_id }) => {
    const calendar = getCalendarClient();
    await calendar.events.delete({
        calendarId,
        eventId: event_id,
    });
    return { deleted: true, event_id };
};
