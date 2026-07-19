import DynamoDBSession from "../telegraf-session-dynamodb/lib/session.js";

export default class Session extends DynamoDBSession {
    getSession(key) {
        let params = {
            Key: {
                SessionKey: key
            }
        };
        return this._db.read(params)
            .then((data) => {
                if (!data.Item || Object.keys(data.Item).length === 0) {
                    return this.createSession(key)
                        .then(() => new Object())
                        .catch((err) => console.log(err));
                }
                return data.Item;
            })
            .catch((err) => console.log(err));
    }
}