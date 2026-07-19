#!/usr/bin/env node
import { dbManager } from "./dbmanager.js";

const ID = process.argv[2] ?? ''
const amount = process.argv[3] ?? 0

if (!ID || amount <= 0) {
    if ( amount <= 0 ) {
        throw Error('Amount should be a positive non-zero number')
    }
    throw Error('Chat ID required')
}
const updateTokens = (chat_id, amount) => async (state, DB) => {
    const key = `${chat_id}:${chat_id}`;
    const data = DB.get('sessions').getById(key).value()
    data.data[chat_id].prevResponses = ''
    data.data[chat_id].tokens_left = (data.data[chat_id].tokens_left ?? 0) + Number(amount)
    const x = await DB.get('sessions').updateById(key, { data: data.data }).write()
}

dbManager(updateTokens(ID, amount))
