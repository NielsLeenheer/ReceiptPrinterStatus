# ReceiptPrinterStatus

This is an library that allows you to get the status information back from StarPRNT and ESC/POS printers.

## What does this library do?

Connect this library to `WebUSBReceiptPrinter`, `WebSerialReceiptPrinter`, `WebBluetoothReceiptPrinter`, or `NetworkReceiptPrinter` to enable two-way communication between your app and a receipt printer. You can request basic printer info and get events when something happens with the printer, such as when the cash drawer is opened or closed, or it is running out of paper. 

Additionally, if you use a barcode scanner connected to a Star receipt printer, this library will enable you to get an event everytime a barcode is scanned, similar to `WebHidBarcodeScanner` or `WebSerialBarcodeScanner`.


## How to use it?

Load the `receipt-printer-status.umd.js` file from the `dist` directory in the browser and instantiate a `ReceiptPrinterStatus` object. 

    <script src='receipt-printer-status.umd.js'></script>

Or import the `receipt-printer-status.esm.js` module:

    import ReceiptPrinterStatus from 'receipt-printer-status.esm.js';



## Connecting to a receipt printer

This library uses the `WebUSBReceiptPrinter`, `WebSerialReceiptPrinter`, `WebBluetoothReceiptPrinter`, or `NetworkReceiptPrinter` library to communicate with the printer. See the documentation of those libraries for examples of how to connect to the receipt printer. All these libraries work in a very similar way. In all cases you instantiate the object, then call the `connect()` function to connect to the printer. Once connected, you get back a `connected` event which you can use to set up `ReceiptPrinterStatus`.

For example:


    const receiptPrinter = new WebUSBReceiptPrinter();

    function handleConnectButtonClick() {
        receiptPrinter.connect();
    }

    receiptPrinter.addEventListener('connected', device => {

        /* Initialize the library and connect it to our printer */

        const printerStatus = new ReceiptPrinterStatus({
            printer:    receiptPrinter,
            language:   device.language
        });
    });


After initializing `ReceiptPrinterStatus`, it will attempt to talk to the printer and exchange some basic information. If that succeeds the library will send a `connected` event of its own as a signal that you are able to use the libary. 

        const printerStatus = new ReceiptPrinterStatus({
            printer:    receiptPrinter,
            language:   device.language
        });

        /* Wait until the library has confirmed that the printer supports two-way communication */

        printerStatus.addEventListener('connected', () => {

            /* We have success! We can now interact with the printer */
        });


If the printer does not support two-way communication it will fire a `unsupported` event. This happens approximately 1 second after initializing the libary.

        printerStatus.addEventListener('unsupported', () => {

            /* Oh no, it looks like this printer does not support two-way communication */
        });


Once the connection to the printer is broken, it will send a `disconnected` event.

        printerStatus.addEventListener('disconnected', () => {

            /* And we're done. We lost connection to the printer */
        });


If at any time you want to check if the libary is connected to the printer you can check the `connected` property. If it is `true`, the library is connected and we have a verified two-way connection. If it is `false` we either have no connection at all, or we just have a one-way connection. Either way, we cannot get any information from the printer.

        if (printerStatus.connected) {
            /* We can talk to the printer */
        }


## Printer language

When instantiating the `ReceiptPrinterStatus` object, we need to provide the language of the printer. Depending on the language of the printer, the library needs to send different commands to the printer.

If your printer supports StarPRNT, you set the language to 'star-print'. If it supports Star Line commands, set it to 'star-line'. If your printer supports ESC/POS, set it to 'esc-pos'. In practice, it does not matter if you specify 'star-prnt' or 'star-line'. Both are extremely similar and during initialisation the printer will send back information about which it supports and set the correct language.

        const printerStatus = new ReceiptPrinterStatus({
            printer:    receiptPrinter,
            language:   'esc-pos'
        });

The `WebUSBReceiptPrinter` gives us back the language that we need to initialze `ReceiptPrinterStatus` in the `connected` callback based on the manufacturer, product id and product name of the printer that is selected. But that information is not available to printers connected to the serial port, so `WebSerialReceiptPrinter` does not provide a language at all. 

    receiptPrinter.addEventListener('connected', device => {

        /* Initialize the library and connect it to our printer */

        const printerStatus = new ReceiptPrinterStatus({
            printer:    receiptPrinter,
            language:   device.language
        });
    });

If no language is provided, the library will attempt to detect the language of the printer by sending it one command in ESC/POS and one in StarPRNT. Depending on the response by the printer the library can tell which command was successful and which language it supports. 

After the `connected` callback function is called, the actual detected language of the printer is can be determined from the `language` property. This value can be used to instantiate the `ReceiptPrinterEncoder` library to encode and send data to the printer.

        printerStatus.addEventListener('connected', () => {
            let encoder = new ReceiptPrinterEncoder({
                language: printerStatus.language
            })
        });


## Printer status

If the printer is connected, you can look at the current status of the printer. You can check if the printer is online and ready to accept jobs, or if it has run out of paper, or if the cover is opened. 

To get the current status you can look at the `status` property.

        if (printerStatus.connected) {

            /* Get the current status of the printer */

            let status = printerStatus.status;

            console.log('The printer cover is', status.coverOpened ? 'open' : 'closed');
        }

The `status` property contains a `ReceiptPrinterInfo` object which has the following properties:

-   `online`<br>
    The printer is online and can accept jobs to print
-   `coverOpened`<br>
    The cover of the printer has been opened
-   `paperLoaded`<br>
    There is paper in the printer
-   `paperLow`<br>
    There is paper in the printer, but it is running low

You can also be notified when any of these properties change by adding an event listener for the `update` event.

        if (printerStatus.connected) {

            /* Set up an event handler for status updates */

            printerStatus.addEventListener('update', status => {                
                console.log('The printer cover is', status.coverOpened ? 'open' : 'closed');
            });
        }

This event is called whenever there is a change to one of the properties of the `ReceiptPrinterInfo` object. In some cases a single action will trigger multiple events. For example, when the cover of the printer is opened, you will get an update because `coverOpened` will have changed, but also another update because the opening the cover will also set the `online` property to false. For convenience, the `ReceiptPrinterInfo` object will be provided to the callback function as a parameter.


## Query the printer for information

Call the `query` function to get more information about the printer itself. This function is asynchronous, as it retrieves the information in real-time from the printer. To get the data, you can use promises or async/await.

    printerStatus.addEventListener('connected', async () => {
        
        let serialnumber = await printerStatus.query('serialnumber');
        console.log('Serialnumber', serialnumber);

        let firmware = await printerStatus.query('firmware');
        console.log('Firmware version', firmware);
    });

You can specify which information you want, by using an string as a parameter. The following information can be retrieved:

-   `manufacturer`<br>
    The manufacturer of the printer
-   `model`<br>
    The model of the printer
-   `serialnumber`<br>
    The serial number of the printer
-   `firmware`<br>
    The version of the firmware used by the printer
-   `fonts`<br>
    An array of suppored two-byte character encodings, such as `CHINA GB2312`, `CHINA GB18030`, `TAIWAN BIG-5`, `KANJI JAPANESE`, `KOREA C-5601C` or `THAI 1 PASS`. If the printer does not support two-byte encodings, the array will be empty.

Please note that not all printers support every type of information. Some printer do not support this feature at all.


## Cash drawer

Most receipt printers have a DK port, which you can use to connect a cash drawer. The printer can send a signal over the DK port to open the drawer and can detect if the drawer has been opened or closed. This library gives you access to this functionality using the `ReceiptPrinterCashDrawer` object on the `cashDrawer` property. 

To open the drawer you can call the `open()` function:

    printerStatus.cashDrawer.open();

To get the status of the drawer you can look at the `opened` property:

    console.log('The cash drawer is', printerStatus.cashDrawer.opened ? 'open' : 'closed');

And finally, you can listen for changes to the state of the cash drawer:

    printerStatus.cashDrawer.addEventListener('update', status => {
        console.log('The cash drawer is', status.opened ? 'open' : 'closed');
    });

    printerStatus.cashDrawer.addEventListener('open', () => {
        console.log('The cash drawer is open');
    });

    printerStatus.cashDrawer.addEventListener('close', () => {
        console.log('The cash drawer is closed');
    });


## Barcode scanners

If your printer supports connecting a barcode scanner, you can also use this libary get access to the barcode scanner. This works very similar to the `WebHidBarcodeScanner` and `WebSerialBarcodeScanner` libraries, but instead of connecting directly to the barcode scanner, you would get the information from the printer instead. To get access to the barcode scanner, you can use the `ReceiptPrinterBarcodeScanner` object which is available on the `barcodeScanner` property.

If you want to know if a barcode scanner is supported by you printer, you can look at the `supported` property.

    if (printerStatus.barcodeScanner.supported) {
        console.log('Barcode scanner is supported');
    }

If you want to know if a barcode scanner is actually connected to your printer, you can use the `connected` property.

    if (printerStatus.barcodeScanner.connected) {
        console.log('Barcode scanner is connected and waiting to scan...');
    }

Please note, that the `supported` and `connected` properties are not immediate available. You cannot rely on it immediately after instantiating the `ReceiptPrinterStatus` object. The libarary first connects to the printer and calls the `connected` event listener on the main object. Then it will asynchronously try to detect barcode scanner support. If it is supported, it will start polling for barcodes and finally it will call its own `connected` event listener. 

    printerStatus.barcodeScanner.addEventListener('connected', () => {                
        console.log('Barcode scanner is connected and waiting to scan...');
    });

Once connected, it will activaly look for barcodes and whenever the libary detects a barcode, it will send out a `barcode` event that you can listen for.

    printerStatus.barcodeScanner.addEventListener('barcode', barcode => {                
        console.log('Found barcode', barcode.value);
    });

The callback is passed an object with the following properties:

-   `value`<br>
    The value of the barcode as a string


## License

MIT

