import { dbManager } from "./dbmanager.js";
import stateBkup from '../chat_db-bkup.json' assert { type: "json" };
function addMaxToken (state, DB) {
    stateBkup.forEach(async ({id, data}) => {
        await DB.get('sessions').push({ id, data }).write()
    }) 
    return stateBkup;
}

dbManager(addMaxToken)