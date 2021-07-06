function login() {
    loginData = {
        UserName: app.inputLoginId,
        ActiveProjectId: -1,
        Password: app.inputPassword,
        LoginAuxData: "SMElectronv0"
    }

    app.loginErrorMessage = "Please wait...";

    return Vue.http.post('api/Login', loginData).then(
        (response) => {
            console.log("login returned");

            app.user = response.data;

            if (app.user.activeProject && app.user.activeProject.openTasks && app.user.activeProject.openTasks.length > 0) {
                Vue.set(app.user, 'activeTask', app.user.activeProject.openTasks[0]);
            }
            app.loginErrorMessage = "";
            app.mode = "timer";
            app.loginData = loginData;
            saveLoginData();
        },
        (reason) => {
            app.mode = 'login';

            if (reason.body) {
                app.loginErrorMessage = reason.body.Message.split(":")[1];
            } else {
                app.loginErrorMessage = "Please connect to the Internet and try again."
            }
        }
    );
}

function logout() {
    var confirmMessage = "Are you sure you want to log out? Logging in again will require an active internet connection. ";
    if (app.syncPackets.length > 0) {
        confirmMessage = "You have unsaved offline data which will be deleted. " + confirmMessage;
    }
    if (confirm(confirmMessage)) {
        app.syncPackets = [],
            saveSyncPackets(),
            app.inputLoginId = "";
        app.inputPassword = "";
        app.mode = "login";
        app.loginData = {};
        saveLoginData();
        app.processQueueLock = false;
    }
}

function saveLoginData() {
    var datatosave = JSON.parse(JSON.stringify(app.loginData));
    storage.set("loginData", datatosave, function(error) {});
}

function webAuthorization() {
    return new Promise(resolve => {
        storage.get('loginData', function(error, loginData) {
            fetch("https://www.screenmeter.com/Account/Login")
                .then(r => r.text())
                .then(r => {
                    const body = document.createElement("div");
                    body.innerHTML = r;

                    return body.querySelector('input[name="__RequestVerificationToken"]').getAttribute("value");
                })
                .then(authToken => {
                    return fetch("https://www.screenmeter.com/Account/Login", {
                        "headers": {
                            "content-type": "application/x-www-form-urlencoded",
                        },
                        "body": `__RequestVerificationToken=${authToken}&UserName=${loginData.UserName}&Password=${loginData.Password}&RememberMe=true`,
                        "method": "POST",
                        "credentials": "include"
                    });
                })
                .then(r => r.text())
                .then(r => {
                    resolve(true);
                })
        });
    })
}

module.exports = { login, logout, saveLoginData, webAuthorization };