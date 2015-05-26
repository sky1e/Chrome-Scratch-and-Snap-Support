(function () {
    var ui = {
        connected: null,
        disconnected: null
    };

    var connection = -1;
    var deviceMap = {};
    var pendingDeviceMap = {};
    var platform;

    //all the sensor info of the finch
    var sensor_nums = {
        temperature: 0,
        light1: 0,
        light2: 0,
        xAcc: 0,
        yAcc: 0,
        zAcc: 0,
        obs1: 0,
        obs2: 0
    };
    //creates the initial window for the app, adds listeners for when a connection
    //is made, and looks for the finch
    var initializeWindow = function () {
        for (var k in ui) {
            var id = k.replace(/([A-Z])/, '-$1').toLowerCase();
            var element = document.getElementById(id);
            if (!element) {
                throw "Missing UI element: " + k;
            }
            ui[k] = element;
        }
        enableIOControls(false);
        chrome.runtime.onMessageExternal.addListener(onMsgRecv);
        chrome.runtime.onConnectExternal.addListener(onConnect);
        enumerateDevices();
    };

    var finchPort;

    //when a connection is made to this app
    var onConnect = function (port) {
        finchPort = port;

        //if it disconnects
        port.onDisconnect.addListener(function () {
            finchPort = undefined;
        });
        // a listener for messages send via this connection 
        //(when the client doesn't open a long
        //term port for communication)
        port.onMessage.addListener(function (request) {
            //the message is asking for the status of the finch (connected or disconnected)
            if (request.message === "STATUS") {
                if (connection === -1) //not connected
                    sendResponse({status: false}); //send status to Scratch
                else {
                    sendResponse({status: true});
                }
            }
            //the message is asking for tts
            else if (request.message === "SPEAK") {
                chrome.tts.speak(request.val); //speak phrase using text to speech
            }
            //the message is asking for sensor information
            else if (request.message === "POLL") {
                sendResponse({
                    temperature: sensor_nums.temperature,
                    light1: sensor_nums.light1,
                    light2: sensor_nums.light2,
                    xAcc: sensor_nums.xAcc,
                    yAcc: sensor_nums.yAcc,
                    zAcc: sensor_nums.zAcc,
                    obs1: sensor_nums.obs1,
                    obs2: sensor_nums.obs2
                });
            }
            else { // setting things, no return report
                var bytes = new Uint8Array(8); //array of bytes to send to Finch
                var counter = 0;
                for (var prop in request) { //read through request, adding each property to byte array
                    if (request.hasOwnProperty(prop)) {
                        bytes[counter] = request[prop];
                        counter++;
                    }
                }
                for (var i = counter; i < bytes.length; ++i) {
                    bytes[i] = 0;
                }
                chrome.hid.send(connection, 0, bytes.buffer, function () {
                });
            }
        });
    };

    //this is called on a report recieved from the finch, it figures out
    //what sensor the report is about and saves it
    //NOTE: calculations are already made to convert the raw sensor data
    //into usable information. Temperature is in Celcius.
    var sortMessages = function (data) {
        var data_array = new Uint8Array(data);
        if (data_array[7] === "T".charCodeAt()) {
            sensor_nums.temperature = Math.round(((data_array[0] - 127) / 2.4 + 25) * 10) / 10;
        }
        else if (data_array[7] === "L".charCodeAt()) {
            sensor_nums.light1 = Math.round(data_array[0] / 2.55);
            sensor_nums.light2 = Math.round(data_array[1] / 2.55);
        }
        else if (data_array[7] === "I".charCodeAt()) {
            sensor_nums.obs1 = data_array[0];
            sensor_nums.obs2 = data_array[1];
        }
        else if (data_array[0] === 153) {
            var newdata = Array(3);
            for (var i = 1; i < 4; i++) {
                if (data_array[i] > 0x1F)
                    newdata[i - 1] = (data_array[i] - 64) / 32 * 1.5;
                else
                    newdata[i - 1] = data_array[i] / 32 * 1.5;
            }
            sensor_nums.xAcc = Math.round(newdata[0] * 10) / 10;
            sensor_nums.yAcc = Math.round(newdata[1] * 10) / 10;
            sensor_nums.zAcc = Math.round(newdata[2] * 10) / 10;
        }

        if (finchPort !== undefined) {
            finchPort.postMessage(sensor_nums);
        }
    };

    //this is what is called when a message is sent directly to this app
    var onMsgRecv = function (request, sender, sendResponse) {
        //the message is asking for the status of the finch (connected or disconnected)
        if (request.message === "STATUS") {
            if (connection === -1) //not connected
                sendResponse({status: false}); //send status to Scratch
            else {
                sendResponse({status: true});
            }
        }
        //the message is asking for tts
        else if (request.message === "SPEAK") {
            chrome.tts.speak(request.val); //speak phrase using text to speech
        }
        //the message is asking for sensor information
        else if (request.message === "POLL") {
            sendResponse({
                temperature: sensor_nums.temperature,
                light1: sensor_nums.light1,
                light2: sensor_nums.light2,
                xAcc: sensor_nums.xAcc,
                yAcc: sensor_nums.yAcc,
                zAcc: sensor_nums.zAcc,
                obs1: sensor_nums.obs1,
                obs2: sensor_nums.obs2
            });
        }
        else { // setting things, no return report
            var bytes = new Uint8Array(8); //array of bytes to send to Finch
            var counter = 0;
            for (var prop in request) { //read through request, adding each property to byte array
                if (request.hasOwnProperty(prop)) {
                    bytes[counter] = request[prop];
                    counter++;
                }
            }
            for (var i = counter; i < bytes.length; ++i) {
                bytes[i] = 0;
            }
            chrome.hid.send(connection, 0, bytes.buffer, function () {
            });
        }
    };

    //this function sends requests to the finch for all of its sensor data
    //this call is made 4 times a second and if it fails, it marks the
    //finch as no longer connected
    var pollSendSensors = function () {
        var bytes = new Uint8Array(8);
        //temperature
        bytes[0] = "T".charCodeAt();
        for (var i = 1; i < bytes.length - 1; ++i) {
            bytes[i] = 0;
        }
        bytes[7] = "T".charCodeAt();
        chrome.hid.send(connection, 0, bytes.buffer, function () {
            var lastError = chrome.runtime.lastError;
            if (lastError) {
                connection = -1;
                enableIOControls(false);
                return;
            }
            var bytes = new Uint8Array(8);
            //light sensors
            bytes[0] = "L".charCodeAt();
            for (var i = 1; i < bytes.length - 1; ++i) {
                bytes[i] = 0;
            }
            bytes[7] = "L".charCodeAt();
            chrome.hid.send(connection, 0, bytes.buffer, function () {
                var lastError = chrome.runtime.lastError;
                if (lastError) {
                    connection = -1;
                    enableIOControls(false);
                    return;
                }
                var bytes = new Uint8Array(8);
                //obstacle sensors
                bytes[0] = "I".charCodeAt();
                for (var i = 1; i < bytes.length - 1; ++i) {
                    bytes[i] = 0;
                }
                bytes[7] = "I".charCodeAt();
                chrome.hid.send(connection, 0, bytes.buffer, function () {
                    var lastError = chrome.runtime.lastError;
                    if (lastError) {
                        connection = -1;
                        enableIOControls(false);
                        return;
                    }
                    var bytes = new Uint8Array(8);
                    //accelerometer info
                    bytes[0] = "A".charCodeAt();
                    for (var i = 1; i < bytes.length - 1; ++i) {
                        bytes[i] = 0;
                    }
                    bytes[7] = "A".charCodeAt();
                    chrome.hid.send(connection, 0, bytes.buffer, function () {
                        var lastError = chrome.runtime.lastError;
                        if (lastError) {
                            connection = -1;
                            enableIOControls(false);
                            return;
                        }
                        //if all the messages sent, send another request in 250ms
                        setTimeout(pollSendSensors, 250);

                    });
                });
            });
        });
    };
    //this function reads reports send from the finch 20 times a second and then
    //parses them to see what information they contain
    //messages are identified by the last byte.
    var pollForSensors = function () {
        chrome.hid.receive(connection, function (id, data) {
            var lastError = chrome.runtime.lastError;
            if (lastError) {
                connection = -1;
                enableIOControls(false);
                return;
            }
            sortMessages(data);
            if (connection !== -1)
                setTimeout(pollForSensors, 50);
        });
    };
    //controls the display of the app (showing if the finch is connected or
    //disonnected)
    var enableIOControls = function (ioEnabled) {
        ui.disconnected.style.display = ioEnabled ? 'none' : 'inline';
        ui.connected.style.display = ioEnabled ? 'inline' : 'none';
    };

    var pendingDeviceEnumerations;
    //looks for devices
    var enumerateDevices = function () {
        var deviceIds = [];
        var permissions = chrome.runtime.getManifest().permissions;
        for (var i = 0; i < permissions.length; ++i) {
            var p = permissions[i];
            if (p.hasOwnProperty('usbDevices')) {
                //the id of the finch is obtained from the manifest file
                deviceIds = deviceIds.concat(p.usbDevices);
            }
        }
        pendingDeviceEnumerations = 0;
        pendingDeviceMap = {};
        for (var j = 0; j < deviceIds.length; ++j) {
            ++pendingDeviceEnumerations;
            //looks for hid device with vendor&product id specified in manifest
            chrome.hid.getDevices(deviceIds[j], onDevicesEnumerated);
        }
    };

    //after devices have been found, the devices variable is an array of
    //HidDeviceInfo, after waiting a second it checks for devices again
    var onDevicesEnumerated = function (devices) {
        for (var i = 0; i < devices.length; ++i) {
            pendingDeviceMap[devices[i].deviceId] = devices[i];
        }
        --pendingDeviceEnumerations;
        if (pendingDeviceEnumerations === 0) {
            //maps opaque device id to HidDeviceInfo
            deviceMap = pendingDeviceMap;
            if (connection === -1) {
                connect();
            }
            setTimeout(enumerateDevices, 1000);
        }
    };
    //records the connection, displays on app that the connection was made,
    //begins polling for information
    var connectFunction = function (connectInfo) {
        if (chrome.runtime.lastError || !connectInfo) {
            return;
        }
        connection = connectInfo.connectionId;
        enableIOControls(true);
        pollForSensors();
        pollSendSensors();
    };
    //connects to non-null devices in device map
    var connect = function () {
        for (var k in deviceMap) {
            var deviceInfo = deviceMap[k];
            if (!deviceInfo)
                return;
            //does actual connecting
            chrome.hid.connect(deviceInfo.deviceId, connectFunction);
        }
    };

    chrome.runtime.getPlatformInfo(function (platformInfo) {
        platform = platformInfo.os;
    });
    window.addEventListener('load', initializeWindow);
}());