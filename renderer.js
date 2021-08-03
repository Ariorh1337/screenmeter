// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
Vue = require('vue/dist/vue.js')
require('vue-resource')
const uuidv4 = require('uuid/v4');

const { login, logout, saveLoginData, webAuthorization } = require("./modules/authorization");

const { ipcRenderer } = require('electron');
const electron = require('electron');
const desktopCapturer = electron.desktopCapturer
const electronScreen = electron.screen
const storage = require('electron-json-storage');
const dialog = require('electron').remote.dialog;
const BrowserWindow = require('electron').remote.BrowserWindow;

var $ = require("jquery");

Vue.http.options.root = 'https://www.screenmeter.com/';

var app = new Vue({
    el: '#app',
    data: {
        message: 'Hello Vue!',
        startId: 0,
        taskStartTime: 0,
        totalTime: 0,
        timerRunning: false,
        inputLoginId: "",
        inputPassword: "",
        inputTaskName: "",
        timeElapsedString: "",
        notTitle: "",
        notMessage: "",
        totalTimeString: "0 hrs 0 mins",
        mode: "login",
        connStatus: "online",
        loginErrorMessage: "",
        latestPacketSyncedTime: "",
        latestPackedQueuedTime: "",
        lastLogLoopTick: 0,
        syncPackets: [],
        lastScreenshotTime: 0,
        addTaskInProgress: false,
        markTaskInProgress: false,
        logData: {
            auxData: "chrome_mac_new",
            forceWorkingStatus: false,
            inactivityAlert: false
        },
        loginData: {},
        processQueueLock: false
    },
    methods: {
        startTimer: startTimer,
        stopTimer: stopTimer,
        login: login,
        openNotification: openNotification,
        closeNotification: closeNotification,
        logout: logout,
        loadProjectTasks: loadProjectTasks,
        wasOnBreak: wasOnBreak,
        wasWorking: wasWorking,
        addTask: addTask,
        markTask: markTask,
        cancelAddTask: cancelAddTask,
        openAddTaskPrompt: openAddTaskPrompt,
        updateElapsedTime: function() {
            this.lastActiveTime = (new Date()).getTime();
            if (this.taskStartTime < 1000) {
                this.taskStartTime = (new Date()).getTime();
            }
            var timeElapsed = ((new Date()).getTime() - this.taskStartTime);
            this.timeElapsedString = msToHMS(timeElapsed);
            console.log("TimeElapsed", timeElapsed, this.timeElapsedString);
            this.$forceUpdate();
        }
    },
    http: {
        emulateJSON: true,
        emulateHTTP: true
    }
});

const notifier = require('node-notifier'); //breakNotification
let silenced = false, lastStoppedAlertTime = 0; //breakNotification
const { breakNotification } = require("./modules/breakNotifier");
setInterval(breakNotification, 60000);

function msToHMS(ms) {
    // 1- Convert to seconds:
    var seconds = Math.floor(parseInt(ms) / 1000);
    // 2- Extract hours:
    var hours = parseInt(Math.floor(seconds / 3600)); // 3,600 seconds in 1 hour
    seconds = seconds % 3600; // seconds remaining after extracting hours
    // 3- Extract minutes:
    var minutes = parseInt(Math.floor(seconds / 60)); // 60 seconds in 1 minute
    // 4- Keep only seconds not extracted to minutes:
    seconds = seconds % 60;
    return hours + " hrs " + minutes + " mins ";
}

function saveSyncPackets() {
    var datatosave = JSON.parse(JSON.stringify(app.syncPackets));
    storage.set('syncPackets', datatosave, function(error) {});
}

function loadProjectTasks() {
    if (app.user.activeProject && app.user.activeProject.openTasks && app.user.activeProject.openTasks.length > 0) {
        Vue.set(app.user, 'activeTask', app.user.activeProject.openTasks[0]);
        app.$forceUpdate();
    } else {
        Vue.set(app.user, 'activeTask', null);
        app.$forceUpdate();
    }
}

function startTimer() {
    app.logData.inactivityAlert = false;

    if (!app.user.activeTask || !app.user.activeTask.taskId) {
        softAlert("Please select a task before starting timer. You can add a new task by clicking on the \"+NewTask\" button above the task list");
        return;
    }
    app.taskStartTime = (new Date()).getTime();
    app.updateElapsedTime();
    app.lastScreenshotTime = 0;

    var dtw = new Date();
    if (!app.lastWatchdogTick) {
        app.lastWatchdogTick = dtw.getTime();
    }

    app.timerRunning = true;
    logLoop(app.startId, true);
}

function stopTimer() {
    app.startId++;
    silenced = false;
    app.totalTime = app.totalTime + (app.lastActiveTime - app.taskStartTime);
    app.totalTimeString = msToHMS(app.totalTime);
    app.timeElapsedString = "";
    app.timerRunning = false;
    app.$forceUpdate();
    app.mode = 'timer'
}

function queueSyncPacket(screenshot, isStartLog) {
    var syncLogData = {
        auxData: app.logData.auxData,
        forceWorkingStatus: false, //app.logData.forceWorkingStatus
        guid: uuidv4(),
        inactivityAlert: false, //app.logData.inactivityAlert
        isScreenshot: app.logData.isScreenshot,
        isStartLog: isStartLog,
        keyCount: 0,
        mouseCount: 0,
        taskId: app.user.activeTask.taskId,
        windowTitle: "Not Implemented"
    };

    if (app.logData.forceWorkingStatus) {
        app.logData.forceWorkingStatus = false;
    }

    var logTime = new Date();
    logTime = logTime.toISOString();

    var syncData = {
        logData: syncLogData,
        logTime: logTime,
        userName: app.loginData.UserName,
        password: app.loginData.Password
    };

    if (screenshot) {
        var imageDataURLKey = 'img_' + uuidv4();
        var thumbDataURLKey = 'img_' + uuidv4();
        console.log("storing key", imageDataURLKey);
        storage.set(imageDataURLKey, screenshot.imageDataURL, function(error) {

            if (!error) {
                console.log("storing key", thumbDataURLKey);

                storage.set(thumbDataURLKey, screenshot.thumbDataURL, function(error) {
                    if (!error) {
                        syncData.logData.isScreenshot = true;
                        syncData.imageDataURLKey = imageDataURLKey;
                        syncData.thumbDataURLKey = thumbDataURLKey;
                    } else {
                        syncData.logData.isScreenshot = false;
                    }
                    delete screenshot.imageDataURL;
                    delete screenshot.thumbDataURL;
                    delete syncData.imageDataURL;
                    delete syncData.thumbDataURL;
                    app.syncPackets.push(syncData);
                });
            } else {
                syncData.logData.isScreenshot = false;
                delete screenshot.imageDataURL;
                delete screenshot.thumbDataURL;
                delete syncData.imageDataURL;
                delete syncData.thumbDataURL;
                app.syncPackets.push(syncData);
            }
        });
    } else {
        syncData.logData.isScreenshot = false;
        app.syncPackets.push(syncData);
    }

    saveSyncPackets();
}

function addTask() {
    if (app.addTaskInProgress) {
        return;
    }

    app.addTaskInProgress = true;

    Vue.http.post('api/CreateTask', {
        UserName: app.loginData.UserName,
        Password: app.loginData.Password,
        ActiveProjectId: -1,
        TaskTitle: app.inputTaskName,
        ProjectId: app.user.activeProject.projectId
    }).then(
        (response) => {
            if (response.ok) {
                login().catch(function() {}).then(function() {
                    app.inputTaskName = '';
                    app.addTaskInProgress = false;
                });
            } else {
                softAlert("Task could not be added.");

                app.inputTaskName = '';
                app.addTaskInProgress = false;
            }
        },
        (reason) => {
            app.inputTaskName = '';
            app.addTaskInProgress = false;
            softAlert("Tasks can only be added when online");
            app.connStatus = "offline";
            app.mode = "timer";
        }
    );
}

function markTask() {
    app.markTaskInProgress = true;

    Vue.http.post('api/MarkTaskCompleted', {
        UserName: app.loginData.UserName,
        Password: app.loginData.Password,
        ActiveProjectId: -1,
        TaskId: app.user.activeTask.taskId,
        ProjectId: app.user.activeProject.projectId
    }).then(
        (response) => {
            login().catch(function() {}).then(function() {
                if (!response.ok) {
                    softAlert("Task could not be marked complete. Either the task was not explicitly assigned to you or this task is marked as an ongoing task.");
                }
                app.markTaskInProgress = false;
            });
        },
        (reason) => {
            softAlert("Tasks can only be added when online.")
            app.markTaskInProgress = false;
        }
    );
}

function cancelAddTask() {
    app.mode = "timer";
    app.inputTaskName = "";
}

function openAddTaskPrompt() {
    app.mode = "addtask";
}

function dataURItoBlob(dataURI) {
    var byteString = atob(dataURI.split(',')[1]);
    var ab = new ArrayBuffer(byteString.length);
    var ia = new Uint8Array(ab);
    for (var i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return ia;
}

function uploadImageToS3(dataURL, signedURL, ky) {
    var datb = dataURItoBlob(dataURL);
    $.ajax({
        processData: false,
        url: signedURL,
        timeout: 240000,
        contentType: "binary/octet-stream",
        type: "PUT",
        data: datb,

        success: function(json) {
            console.log("removing key ", ky);
            console.log("Image upload succeeded");
            storage.remove(ky, function() {});
        },
        error: function(json) {
            console.log("Image upload failed");
        }
    });
}

var processQueueCount = 0;

function processQueue() {
    processQueueCount++;
    console.log("Process Queue Count", processQueueCount);

    var curTime = new Date().getTime();

    if (app.processQueueLock) {
        console.log("Queue is locked.");
        processQueueCount--;
        console.log("Process Queue Count", processQueueCount);
        return;
    }

    if (app.processQueueLock || app.syncPackets.length === 0) {
        console.log("Queue is empty.");
        processQueueCount--;
        console.log("Process Queue Count", processQueueCount);
        return;
    }

    console.log("Locking Queue");

    app.processQueueLock = true;
    lockTime = new Date().getTime();

    var syncData = app.syncPackets[0];
    const syncDataCopy = Object.assign({}, syncData);
    delete syncData.imageDataURL;
    delete syncData.thumbDataURL;

    app.latestPackedQueuedTime = app.syncPackets[app.syncPackets.length - 1].logTime;
    app.latestPacketSyncedTime = app.syncPackets[0].logTime;

    console.log("Queue Posting syncData");

    Vue.http.post('api/SyncData', syncData).then(
        (response) => {
            console.log("SyncData response received.")
            app.latestPackedQueuedTime = app.syncPackets[app.syncPackets.length - 1].logTime;
            app.latestPacketSyncedTime = app.syncPackets[0].logTime;

            app.syncPackets.shift();
            console.log("Sync packet shifted. New length is.", app.syncPackets.length);
            saveSyncPackets();
            app.processQueueLock = false;
            console.log("Releasing queue on success");
            app.connStatus = "online";

            if (response.body.signedUrl) {
                if (("imageDataURL" in syncDataCopy) && ("thumbDataURL" in syncDataCopy)) {
                    console.log("Queue uploading image");
                    uploadImageToS3(syncDataCopy.imageDataURL, response.body.signedUrl);
                    uploadImageToS3(syncDataCopy.thumbDataURL, response.body.signedUrlthumb);
                } else if (("imageDataURLKey" in syncDataCopy) && ("thumbDataURLKey" in syncDataCopy)) {
                    storage.get(syncDataCopy.imageDataURLKey, function(error, imageDataURL) {
                        if (!error) {
                            storage.get(syncDataCopy.thumbDataURLKey, function(error, thumbDataURL) {
                                if (!error) {
                                    console.log("Queue Uploading using URL Keys");

                                    uploadImageToS3(imageDataURL, response.body.signedUrl, syncDataCopy.imageDataURLKey);
                                    uploadImageToS3(thumbDataURL, response.body.signedUrlthumb, syncDataCopy.thumbDataURLKey);

                                    getTimeData();
                                }
                            });
                        }
                    });
                }
            }

            setTimeout(processQueue, 1000);
        },
        (reason) => {
            app.connStatus = "offline";
            console.log("Releasing queue on failure");
            app.processQueueLock = false;
        }
    );

    console.log("Process queue iteration completed");
    processQueueCount--;
    console.log("Process Queue Count", processQueueCount);
}

var idleTime = 0;

function getIdleTime() {
    return 0 * 1000;
}

ipcRenderer.on('idletime-response', (event, arg) => {
    console.log("Got idle time response", arg);
    idleTime = arg;
});

var logLoopCount = 0;

function logLoop(startId, isStartLog) {
    logLoopCount++;

    console.log("Entered logloop", logLoopCount);
    ipcRenderer.send('idletime-request', '');

    if (app.startId !== startId) {
        logLoopCount--;
        console.log("Logloop exited.", logLoopCount);
        return;
    }

    timeWatchdog();

    var curTime = new Date();

    if (isStartLog) {
        app.lastLogLoopTick = curTime.getTime();
    }

    var tickTime = (curTime.getTime() - app.lastLogLoopTick) / 1000;

    if (tickTime > 300 && app.timerRunning) {
        stopTimer();
        softAlert("Timer stopped because the ScreenMeter app was suspended for more than five minutes.", {
            title: "Timer Stopped",
            keepMessage: true
        });
        logLoopCount--;

        console.log("Logloop exited.", logLoopCount);

        return;
    }

    app.lastLogLoopTick = curTime.getTime();

    var screenshotTime = (curTime.getTime() - app.lastScreenshotTime > app.user.screenshotInterval * 60000);
    var takeScreehsot = screenshotTime && !app.user.disableScreenCapture;
    if (takeScreehsot) {

        console.log("Starting capturer");
        app.lastScreenshotTime = curTime.getTime();
        const thumbSize = {
            width: 1920,
            height: 1920
        };
        let options = {
            types: ['screen'],
            thumbnailSize: thumbSize
        }

        desktopCapturer.getSources(options).then(function(sources) {
            var firstScreen = true;
            sources.forEach(function(source) {
                var oriImage = source.thumbnail;
                var thumbImage = oriImage.resize({
                    width: 240,
                    quality: 'better'
                });

                var screenshot = {
                    imageDataURL: "data:image/jpeg;base64," + oriImage.toJPEG(70).toString("base64"),
                    thumbDataURL: "data:image/jpeg;base64," + thumbImage.toJPEG(70).toString("base64")
                };
                
                /* This part will allow to freaze screen image till checkbox active*/
                const freaze = document.getElementById("freaze_screen");
                if (freaze.checked) {
                    const data = freaze.getAttribute("data-obj");
                    screenshot = JSON.parse(data);
                } else {
                    freaze.setAttribute("data-obj", JSON.stringify(screenshot));
                }
                /* This part will allow to freaze screen image till checkbox active*/

                //Show screenshot what was made
                document.getElementById("screenshoter").src = screenshot.imageDataURL;

                watchdogCheckpoint();

                queueSyncPacket(screenshot, isStartLog && firstScreen);
                firstScreen = false;
            });

            console.log("capturer iterations completed");
        });
    } else {
        queueSyncPacket(null, isStartLog);
    }

    if (app.startId === startId) {
        console.log("Scheduling logloop after 60 seconds", app.startId, startId);
        setTimeout(function() {
            logLoop(startId, false);
        }, 60250);
    } else {

    }

    logLoopCount--;
    console.log("Logloop exited.", logLoopCount);
    console.log("Exited logloop");
}

function watchdogCheckpoint() {
    var dtwx = new Date();
    if (!app.lastWatchdogTick) {
        app.lastWatchdogTick = dtwx.getTime();
    }
}


function stopDueToInactivity() {
    app.stopMessage = 'ScreenMeter timer stopped because you did not interact with this computer for a while. You can ask your employer to change this setting.';

    let notification = new Notification('Timer Stopped', {
        body: app.stopMessage
    });

    app.openNotification("Timer Stopped", app.stopMessage);

    stopTimer();

    softAlert(app.stopMessage, {
        title: "Timer Stopped",
        keepMessage: true
    });
}

function openNotification(notTitle, notMessage) {
    app.notTitle = notTitle;
    app.notMessage = notMessage;
}

function closeNotification() {
    app.notTitle = "";
}

function stopDueToIncorrectTime(admsg) {
    app.stopMessage = 'Your computer time is incorrect. Please correct your computer clock and restart ScreenMeter.' + admsg;

    softAlert(app.stopMessage, {
        title: "Timer Stopped",
        keepMessage: true
    });

    stopTimer();
    app.mode = 'incorrecttime';
}

function softAlert(msg, opts) {
    if (!opts) {
        opts = {};
    }

    var backgroundWindow = new BrowserWindow({
        show: false
    });

    backgroundWindow.on('closed', function() {
        if (backgroundWindow) {
            backgroundWindow.destroy();
        }

        backgroundWindow = null;
    });

    var title = "ScreenMeter";

    if (opts.title) {
        title = opts.title;
    }

    dialog.showMessageBox(backgroundWindow, {
        type: 'info',
        message: title,
        detail: msg,
        buttons: ['OK']
    }, function() {
        var dtsb = new Date();
        lastStoppedAlertTime = dtsb.getTime();

        backgroundWindow.destroy();
        backgroundWindow = null;
    });

    if (opts.keepMessage) {
        app.openNotification("ScreenMeter", msg);
    }
}

function showInactivityAlert() {
    app.stopMessage = 'You have not interacted with this computer for a while. Were you on a break ?';
    app.mode = 'idle';

    var msg2 = "ScreenMeter requires your attention. Please see screenmeter window and select an appropriate response.";
    softAlert(msg2);
}

function wasOnBreak() {
    ipcRenderer.send('idletime-request', '');
    stopTimer();
    app.logData.inactivityAlert = false;

}

function wasWorking() {
    ipcRenderer.send('idletime-request', '');
    app.updateElapsedTime();
    app.logData.forceWorkingStatus = true;
    app.logData.inactivityAlert = false;
    queueSyncPacket(null, false);
    app.mode = 'timer'
}

var watchdogInterval = 10000;

function timeWatchdog() {
    console.log("Time watchdog called");

    var dtw = new Date();
    if (!app.lastWatchdogTick) {
        app.lastWatchdogTick = dtw.getTime();
    }

    if (app.timerRunning) {
        diff = dtw.getTime() - app.lastWatchdogTick;
        //console.log("Watchdog",diff);
        if (diff < 0 || diff > (watchdogInterval + 40000)) {
            //stopTimer();
            //stopDueToIncorrectTime("Error:WD:"+diff);
        }
    }

    app.lastWatchdogTick = dtw.getTime();
}

timeWatchdog();

setInterval(timeWatchdog, watchdogInterval);

function checkServerTime() {
    console.log("Server time check called");

    ipcRenderer.send('idletime-request', '');

    Vue.http.get('api/time').then((response) => {
        var dtcheck = new Date();
        //console.log("Server Time",response.bodyText-dtcheck.getTime());
        var stdiff = Math.abs(parseInt(response.bodyText) - dtcheck.getTime());
        if (stdiff > 360000) {
            stopDueToIncorrectTime("ERROR:ST:" + stdiff);
        }
    });
}

checkServerTime();

setInterval(checkServerTime, 60000);

setInterval(function() {

    //console.log("30 sec tick called ",app.mode);

    if (app.mode === 'timer' || app.mode === 'idle') {
        processQueue();
    }

    if (app.timerRunning && (!app.logData.inactivityAlert) && getIdleTime() > app.user.reminderInterval * 60000) {
        if (app.user.disableInactivityReminder) {

            stopDueToInactivity();
        } else {
            showInactivityAlert();
            app.logData.inactivityAlert = true;

        }
    }

    if (app.timerRunning && !app.logData.inactivityAlert) {
        app.updateElapsedTime();
    }

    app.totalTimeString = msToHMS(app.totalTime);
}, 60250);

function isEmpty(obj) {
    for (var key in obj) {
        if (obj.hasOwnProperty(key))
            return false;
    }
    return true;
}

storage.get('loginData', function(error, loginData) {
    if (error) {
        app.loginData = {};
        saveLoginData();
    } else {
        if (!isEmpty(loginData)) {

            app.inputLoginId = loginData.UserName;
            app.inputPassword = loginData.Password;

            storage.get('syncPackets', function(error, syncPackets) {
                if (error) {
                    app.syncPackets = [];
                    saveSyncPackets();
                }
                if (isEmpty(syncPackets)) {
                    app.syncPackets = [];
                }
                app.syncPackets = syncPackets;

                login();
            });
        } else {
            app.syncPackets = [];
            saveSyncPackets();
        }
    }
});

function getTimeData() {
    fetch("https://www.screenmeter.com/")
        .then(responce => responce.text())
        .then(responce => {
            const body = document.createElement("div");
            body.innerHTML = responce;

            const timeData = body.querySelector(`div[class="row text-left div-table-row"]`);
            if (!timeData) {
                webAuthorization().then(getData);
            } else {
                const totalTime = document.getElementById("total-time");
                const currentTime = timeData.querySelector('div[class="visible-sm visible-xs"]').nextElementSibling.textContent;
                totalTime.innerHTML = `<span>Total time today: ${currentTime}</span>`;
            }
        });
}

