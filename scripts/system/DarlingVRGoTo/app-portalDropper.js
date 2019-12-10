/*
    Made by Fluffy Jenkins - 2018
    This code was written in a half asleep depression state.
    If there are issues please don't kill me.
    You are free to make changes just don't be a dick and use this for evil!
 */

/* eslint-disable no-global-assign */
/* global AccountServices */

var userID;

var LOAD_TIMEOUT = 100;

var ROOT = Script.resolvePath('').split("app-portalDropper.js")[0];

var icon = ROOT + "portalDropper.svg?1";
var appHTML = ROOT + "portalDropper.html";
var appUUID = Uuid.generate();

var tablet = Tablet.getTablet("com.highfidelity.interface.tablet.system");
var button = tablet.addButton({
    icon: icon,
    text: "PORTADROP"
});

var trusted = [];
var tempIgnore = [];

var portal = {
    newPortal: function (loc, broadcast, remoteData) {
        var p = {
            loc: loc,
            timer: null,
            timeout: null,
            pos: Vec3.sum(MyAvatar.position, Vec3.multiply(Quat.getForward(MyAvatar.orientation), 2)),
            color: {
                red: randomIntFromInterval(100, 255),
                green: randomIntFromInterval(100, 255),
                blue: randomIntFromInterval(100, 255)
            },
            interval: 500,
            active: false
        };

        if (!!remoteData) {
            p.color = remoteData.color;
            p.pos = remoteData.pos;
        }

        function start(broadcast) {
            p.overlay = Overlays.addOverlay("sphere", {
                position: p.pos, dimensions: {x: 1, y: 2, z: 1},
                color: p.color
            });
            p.textOverlay = Overlays.addOverlay("text3d", {
                parentID: p.overlay,
                position: Vec3.sum(p.pos, {x: 0, y: 1.2, z: 0}),
                color: p.color,
                topMargin: 0.025,
                leftMargin: 0.025,
                solid: true,
                backgroundColor: {red: 0, green: 0, blue: 0},
                isFacingAvatar: true,
                lineHeight: 0.2,
                dimensions: {x: 0.1, y: 0.1, z: 0.1},
                text: p.loc.split("/")[2],
                alpha: 1,
                backgroundAlpha: 1
            });

            Script.setTimeout(function () {
                var a = Overlays.textSize(p.textOverlay, p.loc.split("/")[2]);
                Overlays.editOverlay(p.textOverlay, {dimensions: {x: a.width + 0.05, y: a.height + 0.025}});
            }, 100);


            p.timeout = Script.setTimeout(function () {
                Overlays.deleteOverlay(p.overlay);
                Script.clearInterval(p.timer);
            }, 30000);

            if (broadcast) {
                Messages.sendMessage("PORTAL_MESSAGE_CHANNEL", JSON.stringify({
                    "loc": p.loc,
                    "remoteData": {
                        "color": p.color,
                        "pos": p.pos
                    },
                    "avatar": userID,
                    "name": MyAvatar.sessionDisplayName
                }));
            }


            p.timer = Script.setInterval(function () {
                if (Vec3.withinEpsilon(MyAvatar.position, p.pos, 0.75) && p.active) {
                    location = p.loc;
                    Overlays.deleteOverlay(p.overlay);
                    Script.clearInterval(p.timer);
                    Script.clearTimeout(p.timeout);
                } else if (!Vec3.withinEpsilon(MyAvatar.position, p.pos, 0.75) && !p.active) {
                    p.active = true;
                }
            }, p.interval);


            Script.scriptEnding.connect(function () {
                Script.clearInterval(p.timer);
                Overlays.deleteOverlay(p.overlay);
            });
        }

        start(broadcast);
    }
};

var isOpen = false;

function onClicked() {
    if (isOpen) {
        tablet.gotoHomeScreen();
    } else {
        tablet.gotoWebScreen(appHTML + "?appUUID=" + appUUID, {});
    }
}

function onScreenChanged(type, url) {
    isOpen = (url === appHTML);
}

function randomIntFromInterval(min, max) {
    return (Math.random() * (max - min + 1) + min);
}

function emitScriptEvent(obj) {
    obj.appUUID = appUUID;
    tablet.emitScriptEvent(JSON.stringify(obj));
}

button.clicked.connect(onClicked);
tablet.screenChanged.connect(onScreenChanged);

function init() {
    userID = Settings.getValue("portalDropper/userID", "portalDropper" + Uuid.generate());
    Settings.setValue("portalDropper/userID", userID);
    try {
        Messages.subscribe("PORTAL_MESSAGE_CHANNEL");
        Messages.messageReceived.connect(messageReceived);
    } catch (e) {
        //
    }
    try {
        tablet.webEventReceived.connect(onWebEventReceived);
    } catch (e) {
        print("connectWebHandler: error connecting: " + e);
    }
}

function isTrusted(avatar) {
    var trust = false;
    trusted.forEach(function (user) {
        if (user === avatar) {
            trust = true;
        }
    });
    return trust;
}

function getLocationBookmarks() {
    var b = Settings.getValue("locationBookmarks", "{}");
    return b;
}

function setLocationBookmarks(name, location) {
    var b = JSON.parse(Settings.getValue("locationBookmarks", "{}"));
    b[name] = location;
    Settings.setValue("locationBookmarks", b);
}

function onWebEventReceived(event) {
    event = JSON.parse(event);
    if (event.appUUID === appUUID) {
        if (event.type === "ready") {
            Script.setTimeout(function () {
                emitScriptEvent({historySync: Settings.getValue("portalDropper/history", "")});
            }, LOAD_TIMEOUT);
        }
        if (event.historySync) {
            Settings.setValue("portalDropper/history", event.historySync);
        }
        if (event.loc) {
            portal.newPortal(event.loc, true);
        }
    }
}

function messageReceived(chan, msg, id) {
    if (chan === "PORTAL_MESSAGE_CHANNEL" && id !== MyAvatar.sessionUUID) {
        var data = JSON.parse(msg);
        if (tempIgnore.indexOf(data.avatar) !== -1) {
            return;
        }
        if (isTrusted(data.avatar)) {
            if (data.loc.search("hifi://") === 0) {
                portal.newPortal(data.loc, false, data.remoteData);
            }
        } else {
            var trust = Window.confirm("Do you trust this user " + data.name + " to show portals?");
            if (trust) {
                trusted.push(data.avatar);

                if (data.loc.search("hifi://") === 0) {
                    portal.newPortal(data.loc, false, data.remoteData);
                }
            } else {
                tempIgnore.push(data.avatar);
            }
        }
    }
}

function shutdown() {
    try {
        Messages.messageReceived.disconnect(messageReceived);
    } catch (e) {
        //
    }
    try {
        tablet.webEventReceived.disconnect(onWebEventReceived);
    } catch (e) {
        print("disconnectWebHandler: error disconnecting web handler: " + e);
    }
    button.clicked.disconnect(onClicked);
    tablet.screenChanged.disconnect(onScreenChanged);
    tablet.removeButton(button);
}

init();

Script.scriptEnding.connect(function () {
    shutdown();
});
