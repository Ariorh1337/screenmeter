function breakNotification() {
    if (silenced) return;
    if (app.timerRunning) return;

    const timestamp = new Date().getTime();
    if (timestamp - lastStoppedAlertTime < 40000) return;

    notifier.notify(
        {
            title: "On a break",
            message: "ScreenMeter is not logging time.",
            icon: "./timeblock.png",
            wait: false,
            actions: ["OK", "Turn Off"]
        },
        (error, response, metadata) => {
            if (response !== "turn off") return;

            silenced = true;
        }
    );

    lastStoppedAlertTime = timestamp;
}

module.exports = { breakNotification };