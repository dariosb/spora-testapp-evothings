var app = (function()
{
	// Application object
	var app = {};

	// Discovered devices
	var devices = {};

	// Reference to the device we are connecting to
	var connectee = null;

	// Store characteristics as UUID/Characteristic map
	var characteristics = {};

	// Timer that updates the device list and removes inactive
	// devices in case no devices are found by scan.
	var updateTimer = null;

	// UUID's used to control the button & LED
	var SERVICE_UUID	= '866d3b04-e674-40dc-9c05-b7f91bec6e83';
	
	var CHAR_CMD = '914f8fb9-e8cd-411d-b7d1-14594de45425';
	var FLOW_CTRL = 'e2048b39-d4f9-4a45-9f25-1856c10d5639';
	var CHAR_RESP = '3bb535aa-50b2-4fbe-aa09-6b06dc59a404';

	var scanTimeout;
	var scanTime = 20000; // default scan time in ms
    var cfg_motThr = 1020; // default Motion Thr
    var cfg_user = "Spora User";
    
    // MPU9250 configuration constants
    var MPU9250_ACC_LSB = 16 * 2 / 0xFFFF; // +/-16g in 16bit resolution
    var MPU9250_MTHR_LSB = 1020 / 255     // 1020mg in 255bit resolution
    var MPU9250_MAG_LSB = 4800 * 2 / 0xFFFF; // +/-4800uT in 16 bit resolution
    var MPU9250_TMP_K = 333.87;            // temp[ºC] = (temp / 333.87) + 21
    var MPU9250_TMP_OFFSET = 21;


	// Wait for all libraries to have loaded
	app.initialize = function()
	{
		document.addEventListener(
			'deviceready',
			function() { evothings.scriptsLoaded(onDeviceReady) },
			false);
	};

	// Display a scan status message
	function displayConnectStatus(message)
	{
		console.log(message);
		document.getElementById('scan-status').innerHTML = message;
	};

	function onDeviceReady()
	{
		window.location = '#';
	};

	// Called when Start Scan button is selected.
	app.onStartScanButton = function()
	{
		displayConnectStatus('Scanning for Bluetooth devices...');

		// Start scanning for devices.
		// If a device is found, set the timestamp and
		// insert the device into the array of devices
		evothings.ble.startScan(
			function onDeviceFound(device)
			{		
				console.log('Found device:' + JSON.stringify(device.advertisementData));
				if( device.advertisementData.kCBAdvDataLocalName == 'Spora' )
			    {
			        console.log('Found the TI SensorTag!')
					// Set timestamp for device (this is used to remove
					// inactive devices).
					device.timeStamp = Date.now();

					// Insert the device into table of found devices.
					devices[device.address] = device;
			    }
			},
			function onScanError(error)
			{
				console.log('Scan error: ' + error);
			}
		);

		// Update the device list every 500ms
		updateTimer = setInterval(displayDeviceList, 500);

		// Automatically stop scanning after a certain time 
		scanTimeout = setTimeout(
			function() 
			{
				evothings.ble.stopScan();
				displayConnectStatus('Not Connected');
				clearInterval(updateTimer);
			}, 
			scanTime
		); 
	};

	// Called when Disconnect button is pressed.
	app.onDisconnectButton = function()
	{
		evothings.ble.close(connectee) // Disconnect device

		console.log('unbond device succesfully');

		devices = {}; // Remove all previously found devices
		displayConnectStatus('Disconnected');
		displayDeviceList();
		window.location = '#'; // Return to 'home' screen
		document.getElementById('scanwindow').style.display = '';
	};

	// Display the device list
	function displayDeviceList()
	{
		// Clear device list
		document.getElementById('found-devices').innerHTML = '';

		for(address in devices)
		{
			var device = devices[address];

			// Only show devices that are updated during the last 10 seconds
			if(device.timeStamp + 10000 > Date.now())
			{
				addDeviceToView(device);
			}
		}

	}

	function addDeviceToView(device)
	{
		var rssiWidth = 100; // Used when RSSI is zero or greater
		if (device.rssi < -100) { rssiWidth = 0; }
		else if (device.rssi < 0) { rssiWidth = 100 + device.rssi; }

		// Create tag for device data.
		var element = 
			'<li >'
			+	'<strong>' + device.name + '</strong> <br />'
			// Do not show address on iOS since it can be confused
			// with an iBeacon UUID.
			+	(evothings.os.isIOS() ? '' : device.address + '<br />')
			+	'<button onclick="app.connect(\'' + device.address + '\')" class="blue hue">CONNECT</button> <br />'
			+ 	 device.rssi 
			+ 	'<div style="background:rgb(60,184,18);height:20px;width:'
			+ 		rssiWidth + '%;">'
			+ 	'</div>'
			+ '</li>';

		document.getElementById('found-devices').innerHTML += element;
	}

	app.connect = function(address) 
	{
		var device = devices[address];
		
		if(device === undefined)
		{
			return;
		}

		clearTimeout(scanTimeout);
		evothings.ble.stopScan();

		displayConnectStatus('Connecting to: ' + device.name);

		connectee = device; // Store device for future use

		evothings.ble.connectToDevice( 
			device, 
			onConnected,
			onDisconnected,
			onConnectedError);

		function onConnected(device)
		{	
			console.log('Connected to device')
			
			document.getElementById('scanwindow').style.display = 'none';
			
			displayConnectStatus('Connected to: ' + device.name);
			document.getElementById('peerdevice').innerHTML=
				'<h1>Connected to: ' + device.name + '</h1>';
			// No longer update the list of found devices
			clearInterval(updateTimer); 

			enableNotification(device);

			window.location = '#connected';
		};

		function onDisconnected(success)
		{	
			console.log('Disconnected to device')

			window.location = '#'; // Return to 'home' screen
			document.getElementById('scanwindow').style.display = '';
		};

		function onConnectedError(error)
		{
			displayConnectStatus('Connect error: '+ error);

			window.location = '#';
			document.getElementById('scanwindow').style.display = '';
		};
	};

  	function parseSporaDataPaket(json)
    {
        //alert(String(json.x));
                
        var temp = (json.c / MPU9250_TMP_K) + MPU9250_TMP_OFFSET;
        var accx = (json.x * MPU9250_ACC_LSB);
        var accy = (json.y * MPU9250_ACC_LSB);
        var accz = (json.z * MPU9250_ACC_LSB);
        var accmod = Math.sqrt(Math.pow(accx,2)+Math.pow(accy,2)+Math.pow(accz,2))

        var magx = (json.u * MPU9250_MAG_LSB);
        var magy = (json.v * MPU9250_MAG_LSB);
        var magz = (json.w * MPU9250_MAG_LSB);
       
        var motThr = (json.h * MPU9250_MTHR_LSB);

        jQuery("#Time").text(String(json.t));

        jQuery("#AccX").text(String(accx.toFixed(2)));
        jQuery("#AccY").text(String(accy.toFixed(2)));
        jQuery("#AccZ").text(String(accz.toFixed(2)));
        jQuery("#AccMod").text(String(accmod.toFixed(2)));

        jQuery("#MagX").text(String(magx.toFixed(2)));
        jQuery("#MagY").text(String(magy.toFixed(2)));
        jQuery("#MagZ").text(String(magz.toFixed(2)));

        jQuery("#Temp").text(String(temp.toFixed(2)));

        if(json.b == 0)
            jQuery("#Button").text("OFF");
        else
            jQuery("#Button").text("ON");

        jQuery("#Threshold").text(String(motThr.toFixed(0)));

        jQuery("#Name").text(String(json.n));
    };

	function enableNotification(device)
	{	
		var service = evothings.ble.getService(device, SERVICE_UUID);
		var flowCharacteristic = evothings.ble.getCharacteristic(service, FLOW_CTRL);
		// Start notifications
		evothings.ble.enableNotification( 
			device, 
			flowCharacteristic, 
			onFlowNotification, 
			onFlowNotificationError );
	};

	function onFlowNotification(data)
	{
		console.log('Flow Notification');
		
		var service = evothings.ble.getService(connectee, SERVICE_UUID);
		var chrespCharacteristic = evothings.ble.getCharacteristic(service, CHAR_RESP);
		// Called every time new data is available.
		var bg = document.getElementById('connected');
		//bg.style.backgroundColor = randomHexColor();

		evothings.ble.readCharacteristic
		(
			connectee, 
			chrespCharacteristic,
			function(data)
			{
				console.log('Read RX data');
				// success

//				var textbox = document.getElementById('response_text');
                
//				textbox.value = evothings.ble.fromUtf8(data);
//    			textbox.value = textbox.value.replace("ATr+PRINT=", "");
//    			textbox.value = textbox.value.replace("\\EOSM", "");
//
                var rxdata = evothings.ble.fromUtf8(data);
                rxdata = rxdata.replace("ATr+PRINT=", "");
    			rxdata = rxdata.replace("\\EOSM", "");

                var json = jQuery.parseJSON(rxdata);

                parseSporaDataPaket(json);
			},
			function(error)
			{
				console.log('BLE write error (reading): ' + error);
			}
		)
	};

	function onFlowNotificationError(data)
	{
		console.log('Error enabling notification: ' + error);
	};

	function xmitToPeer(str)
	{
		var service = evothings.ble.getService(connectee, SERVICE_UUID);
		var chrcmdCharacteristic = evothings.ble.getCharacteristic(service, CHAR_CMD);

		var arr= new Uint8Array(str.length);
		for(var i=0;i<str.length;i++){
			arr[i]=str.charCodeAt(i);
		}	

	   	evothings.ble.writeCharacteristic(
	   		connectee,
	     	chrcmdCharacteristic,
	     	arr,
	     	function()
	     	{
	       		var textbox = document.getElementById('response_text');
				textbox.value ="";
				textbox.style.backgroundColor = "gainsboro";
	     	},
	     	function(error)
	     	{
	      		console.log('BLE write error (toggle): ' + error);
			}
		);
	};
	
	// Called when Toggle button is pressed
	app.toggle = function() 
	{
		// Convert string to Uint8Array
		str = document.getElementById('cmd_to_send').value;
		xmitToPeer(str);
	};

	// Called when Atri button is pressed
	app.atri = function() 
	{
		// Convert string to Uint8Array
		str = "ATrI"
		xmitToPeer(str);
	};
	
	// Called when Atri button is pressed
	app.atprint = function() 
	{
		// Convert string to Uint8Array
		str = "ATr+PRINT=" + document.getElementById('message_to_send').value;
		xmitToPeer(str);
	};

	// Called when the Scan time slider is selected
	app.setScanTime = function(value)
	{
		scanTime = value * 1000; // we need time in ms

	   	var el = document.getElementById('scan-time');
	   	el.innerHTML = 'Bluetooth scan time: ' + value + ' seconds';
	};

	app.setMotionThr = function(value)
	{
        console.log(value);
		cfg_motThr = value / MPU9250_MTHR_LSB;

	   	var el = document.getElementById('MotionThr');
	   	el.innerHTML = 'Motion Detection Threshold: ' + value + ' mg';
	};
    
	app.setUser = function(value)
	{
		cfg_user = value;

	   	var el = document.getElementById('User');
	   	el.innerHTML = 'User Name: ' + value;
	};
    
	app.onSubmitCfg = function()
	{
        var Jcfg = new Object();

        Jcfg.h = cfg_motThr;
        Jcfg.n = cfg_user;

		str = "ATr+PRINT=" + "+RCV=" + JSON.stringify(Jcfg) + "\\EOSM\r";
        str = str.replace(",",";");

        document.getElementById('waitwheel').style.display = 'block';

        console.log(cfg_motThr);
        console.log(str);
		xmitToPeer(str);

	};
    
	return app;

})();

// Initialise app.
app.initialize();
