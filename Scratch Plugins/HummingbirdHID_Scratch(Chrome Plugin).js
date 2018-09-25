(function () {
    var hummingbirdAppID = "lfloofocohhfeeoohpokmljiinfmpenj"; //unique app ID for Hummingbird Scratch App
    //port connecting to chrome app
    var hPort;
    //connection status
    var hStatus = 0;
    //whether or not this is a dup
    var isDuo;
    //sensor info
    var sensorvalue = new Array(4);
    //when a new message is recieved, save all the info
    var onMsgHummingbird = function (msg) {
        sensorvalue = msg;
    };
    function fitTo255(num) {
        return Math.max(Math.min(num,255.0),0.0);
    }
    //gets the connection status fo the hummingbird
    var getHummingbirdStatus = function () {
        console.log("status");
        chrome.runtime.sendMessage(hummingbirdAppID, {message: "STATUS"}, function (response) {
            if (response === undefined) { //Chrome app not found
                console.log("Chrome app not found");
                hStatus = 0;
                setTimeout(getHummingbirdStatus, 1000);
            }
            else if (response.status === false) { //Chrome app says not connected
                if (hStatus !== 1) {
                    console.log("Not connected");
                    hPort = chrome.runtime.connect(hummingbirdAppID);
                    hPort.onMessage.addListener(onMsgHummingbird);
                }
                hStatus = 1;
                setTimeout(getHummingbirdStatus, 1000);
            }
            else {// successfully connected
                if (hStatus !==2) {
                    console.log("Connected");
                    isDuo = response.duo;
                    console.log("isDuo: " + isDuo);
                    hPort = chrome.runtime.connect(hummingbirdAppID);
                    hPort.onMessage.addListener(onMsgHummingbird);
                    console.log(hPort.onMessage);
                }
                hStatus = 2;
                setTimeout(getHummingbirdStatus, 1000);
            }
        });
    };

    var ext = {
        //all the below functions take in a portnum, it is assumed that the port
        //has the appropriate device connected to it. i.e. getDistance(1) assumes
        //a distance sensor is actually connected in port 1. If a different device
        //is connected the information received will not be useful.

        //setters for motors, LEDs, servos, and vibration
        setHummingbirdMotor: (function(){
            var motors;
            function setMotorVelocity(port, velocity) {
                function callback() {
                    if (motors[port] === velocity) {
                        delete motors[port];
                    }
                    else {
                        setMotorVelocity(port, window.birdbrain.motors[port]);
                    }
                }
                var report = {
                    message: "M".charCodeAt(0),
                    port: port.toString().charCodeAt(0),
                    direction: (velocity < 0 ? 1 : 0).toString().charCodeAt(0),
                    velocity: Math.abs(velocity),

                    callback: callback
                };

                hPort.postMessage(report);
            }
            return function (portnum, velocity) {
                var realPort = portnum - 1; //convert from zero-indexed
                velocity = fitTo255(Math.floor(Math.abs(velocity) * 2.55));

                if (motors[realPort] === undefined) {
                    setMotorVelocity(realPort, velocity)
                }

                motors[realPort] = velocity;
            }
        })(),
        setTriLed: (function() {
            var triLEDs = {};
            function setLEDIntensities(port, intensities) {
                function callback() {
                    if (JSON.stringify(triLEDs[port]) === JSON.stringify(intensities)) {
                        delete triLEDs[port];
                    }
                    else {
                        setLEDIntensities(port, triLEDs[port]);
                    }
                }

                var report = {
                    message:"O".charCodeAt(0),
                    port: port.toString().charCodeAt(0),
                    red: intensities[0],
                    green: intensities[1],
                    blue: intensities[2],

                    callback: callback
                };
                hPort.postMessage(report);
            }
            return function (portnum, rednum, greennum, bluenum) {
                var realPort = portnum - 1; //convert from zero-indexed
                var realIntensities = [rednum, greennum, bluenum].map(function(intensity) {
                    return Math.floor(Math.max(Math.min(intensity*2.55, 255), 0));
                });

                if (triLEDs[realPort] === undefined) {
                    setLEDIntensities(realPort, realIntensities);
                }

                triLEDs[realPort] = realIntensities;
            };
        })(),
        setLed: (function() {
            function setLEDIntensity(port, intensity) {
                var LEDs = {};
                function callback() {
                    if (LEDs[port] === intensity) {
                        delete LEDs[port];
                    }
                    else {
                        setLEDIntensity(port, LEDs[port]);
                    }
                }

                var report = {
                    message:"L".charCodeAt(0),
                    port: port.toString().charCodeAt(0),
                    intensity: intensity,

                    callback: callback
                };
                hPort.postMessage(report);
            }
            return function (portnum, intensitynum) {
                var realPort = portnum - 1;
                var realIntensity = fitTo255(Math.floor(intensitynum * 2.55));

                if (LEDs[realPort] === undefined) {
                  setLEDIntensity(realPort, realIntensity);
                }

                LEDs[realPort] = realIntensity;
            };
        })(),
        setServo: (function() {
            var servos = {};
            function setServoAngle(port, angle) {
                function callback() {
                    if (servos[port] === angle) {
                        delete servos[port];
                    }
                    else {
                        setServoAngle(port, servos[port]);
                    }
                }
                var report = {
                    message: "S".charCodeAt(0),
                    port: port.toString().charCodeAt(0),
                    angle: angle,

                    callback: callback
                };
                hPort.postMessage(report);
            }
            return function (portnum, ang) {
                var realPort = portnum - 1; //convert to zero-indexed number
                var realAngle = Math.max(Math.min((ang * 1.25), 225.0), 0.0);

                if (servos[realPort] === undefined) {
                    setServoAngle(realPort, realAngle);
                }

                servos[realPort] = realAngle;
            };
        })(),
        setVibration: (function() {
            var vibrations = {};
            function setVibrationIntensity(port, intensity) {
                function callback() {
                    if (vibrations[port] === intensity) {
                        delete vibrations[port];
                    }
                    else {
                        setVibrationIntensity(port, vibrations[port]);
                    }
                }
                var report = {
                    message: "V".charCodeAt(0),
                    port: port.toString().charCodeAt(0),
                    intensity: intensity,

                    callback: callback
                };
                hPort.postMessage(report);
            }
            return function (portnum, intensitynum) {
                var realPort = portnum - 1; //convert to zero-indexed number
                var realIntensity = fitTo255(Math.floor(intensitynum * 2.55));

                if (vibrations[realPort] === undefined) {
                  setServoIntensity(realPort, realIntensity);
                }

                vibrations[realPort] = realIntensity;
            };
        })(),


        //getters for sensor information
        getHummingbirdTemp: function (port) {
            //returns temperature in Celsius degrees
            return Math.floor(((sensorvalue[port - 1] - 127) / 2.4 + 25) * 100 / 100);
        },
        getDistance: function (port) {
            var reading;
            var polynomial;
            if (isDuo){
                reading = sensorvalue[port - 1] * 4;
                if (reading < 130) {
                    return 100;
                }
                reading = reading - 120;
                if (reading > 680) {
                    return 5;
                }
                polynomial = [
                    +90.707167605683000,
                    -0.756893112198934,
                    +0.003416264518201,
                    -0.000008279033021,
                    +0.000000010057143,
                    -0.000000000004789
                ];
            }
            else{
                reading = sensorvalue[port-1];
                if(reading < 23){
                    return 80;
                }
                polynomial = [
                    +206.76903754529479,
                    -9.3402257299483011,
                    +0.19133513242939543,
                    -0.0019720997497951645,
                    +9.9382154479167215*Math.pow(10, -6),
                    -1.9442731496914311*Math.pow(10, -8)
                ];
            }
            var distance = 0;
            // Evaluate ax^5 + bx^4 + cx^3  dx^2 + ex + f
            for (var i = 0; i < 6; i++) {
                distance += Math.pow(reading, i) * polynomial[i];
            }
            return Math.floor(distance);
        },
        getVolt: function (port) {
            //returns voltage 0-5V
            return Math.floor(100 * sensorvalue[port - 1] / 51.0) / 100;
        },
        getSound: function (port) {
            //sound is already approximately on a 0-100 scale, so it does not need to be scaled
            return sensorvalue[port - 1];
        },
        getRaw: function (port) {
            //converts to 0 to 100 scale
            return Math.floor(sensorvalue[port - 1] / 2.55);
        },
        hSpeak: function (phrase) {
            //uses Chrome text to speech API to speak the phrase
            var report = {message: "SPEAK", val: phrase};
            hPort.postMessage(report);
        },
        _shutdown: function () {
            //sends disconnect to Hummingbird
            var report = {message: "R".charCodeAt(0)};
            hPort.postMessage(report);
        },
        resetAll: function () {
            //sends reset to Hummingbird
            var report = {message: "X".charCodeAt(0)};
            hPort.postMessage(report);
        },
        _getStatus: function () {
            var currStatus = hStatus;
            if (currStatus === 2)
                return {status: 2, msg: 'Connected'};
            else if (currStatus === 1)
                return {status: 1, msg: 'Hummingbird Not Connected'};
            else
                return {status: 0, msg: 'Chrome App Not Connected'};
        }
    }

    var descriptor = {
        blocks: [
            [' ', "HB motor %m.two , speed %n", "setHummingbirdMotor", 1, 0],
            [' ', "HB triLED %m.two , R: %n G: %n B: %n", "setTriLed", 1, 0, 100, 0],
            [' ', "HB LED %m.port , intensity %n", "setLed", 1, 50],
            [' ', "HB servo %m.port , angle %n", "setServo", 1, 90],
            [' ', "HB vibration motor %m.two , speed %n", "setVibration", 1, 50],
            [' ', "Speak %s", "hSpeak", "Hello World!"],
            ['r', "HB temperature on port %m.port", "getHummingbirdTemp", 1],
            ['r', "HB sound on port %m.port", "getSound", 1],
            ['r', "HB rotary on port %m.port", "getRaw", 1],
            ['r', "HB light sensor on port %m.port", "getRaw", 1],
            ['r', "HB distance sensor on port %m.port", "getDistance", 1],
            ['r', "HB voltage on port %m.port", "getVolt", 1]
        ],
        menus: {
            port: ['1', '2', '3', '4'],
            two: ['1', '2']
        },
        url: 'http://hummingbirdkit.com/learning/scratch-20-programming'
    };
    getHummingbirdStatus();
    ScratchExtensions.register('Hummingbird', descriptor, ext);
})();
