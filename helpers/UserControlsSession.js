import Session from "./Session.js";

export default class UserControlsSession extends Session {
    getCreateSessionParams(key) {
        return {
            Item: {
                SessionKey: key,
                authenticated: false,
                first_name: '',
                last_name: '',
                full_name: ''
            }
        }
    }

    getSaveSessionParams(key, session = {}) {
        const { authenticated, first_name, last_name, full_name } = session

        const params = {
            ExpressionAttributeNames: {
                "#AU": "authenticated",
                "#FN": "first_name",
                "#LN": "last_name",
                "#NN": "full_name"
            },
            Key: {
                SessionKey: key
            },
            UpdateExpression: 'set #AU = :a1, #FN = :f1, #LN = :l1, #NN = :n1',
            ExpressionAttributeValues: {
                ':a1': authenticated,
                ':f1': first_name,
                ':l1': last_name,
                ':n1': full_name
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