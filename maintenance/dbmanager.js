import LocalSession from "telegraf-session-local";


export const dbManager = async (cb) => {
    try {
        const session = new LocalSession({ database: "chat_db.json" })

        cb(session.DB.getState(), session.DB)
        console.log("success")
    } catch (e) {
        console.log("failed: " + e)
    }
}