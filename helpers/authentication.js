export const authenticated = (ctx) => {
    const tokensLeft = ctx.session.tokens_left;
    if (tokensLeft != null && tokensLeft <= 0) {
        const resetMonth = ctx.session.tokens_reset_month;
        ctx.reply(`You have used up your monthly token allowance${resetMonth ? ` (resets ${resetMonth})` : ''}. Please try again next month.`);
        return false;
    }
    return true;
}
