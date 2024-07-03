# ThermalPrinterStatus

This is an library that allows you to get the status information back from StarPRNT and ESC/POS printers.

## What does this library do?

Connect this library to `WebUSBReceiptPrinter` to enable two-way communication between your app and a receipt printer. You can request basic printer info and get events when something happens with the printer, such as when the cash drawer is opened or closed, or it is running out of paper. 

Additionally, if you use a Star barcode scanner, such as the BCR-POP1, connected to a Star receipt printer, this library will enable you to get an event everytime a barcode is scanned, similar to `WebHidBarcodeScanner` or `WebSerialBarcodeScanner`.


## How to use it?

Load the `thermal-printer-status.umd.js` file from the `dist` directory in the browser and instantiate a `ThermalPrinterStatus` object. 

    <script src='thermal-printer-status.umd.js'></script>

Or import the `thermal-printer-status.esm.js` module:

    import ThermalPrinterStatus from 'thermal-printer-status.esm.js';



## Connecting to a receipt printer

This library uses the `WebUSBReceiptPrinter` library to communicate with the printer. See the documentation of that library to connect to the receipt printer. During the `connected` event you get from that library you can set up `ThermalPrinterStatus`.

    const receiptPrinter = new WebUSBReceiptPrinter();

    function handleConnectButtonClick() {
        receiptPrinter.connect();
    }

    receiptPrinter.addEventListener('connected', device => {

        /* Initialize the library and connect it to our printer */

        const printerStatus = new ThermalPrinterStatus({
            printer:    receiptPrinter,
            language:   device.language
        });
    });


After initializing `ThermalPrinterStatus`, it will attempt to talk to the printer and exchange some basic information. If that succeeds the library will send a `connected` event of its own as a signal that you are able to use the libary. 

        const printerStatus = new ThermalPrinterStatus({
            printer:    receiptPrinter,
            language:   device.language
        });

        /* Wait until the library has confirmed that the printer supports two-way communication */

        printerStatus.addEventListener('connected', () => {

            /* We have success! We can now interact with the printer */
        });


If the printer does not support two-way communication it will fire a `timeout` event. This happens approximately 2 seconds after initializing the libary.

        printerStatus.addEventListener('timeout', () => {

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


## Printer status

If the printer is connected, you can look at the current status of the printer. You can check if the printer is online and ready to accept jobs, or if it has run out of paper, or if the cover is opened. And if you connected a cashdrawer to the DK port of the printer, you can determine of the drawer has been opened, or if it is closed.

To get the current status you can look at the `status` property.

        if (printerStatus.connected) {

            /* Get the current status of the printer */

            let status = printerStatus.status;

            console.log('The cashdrawer is', status.cashdrawerOpened ? 'open' : 'closed');
        }

The `status` property contains a `ThermalPrinterStatusInfo` object which has the following properties:

-   `online`<br>
    The printer is online and can accept jobs to print
-   `cashdrawerOpened`<br>
    The cash drawer connected to the printer is open
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
                console.log('The cashdrawer is', status.cashdrawerOpened ? 'open' : 'closed');
            });
        }

This event is called whenever there is a change to one of the properties of the `ThermalPrinterStatusInfo` object. In some cases a single action will trigger multiple events. For example, when the cover of the printer is opened, you will get an update because `coverOpened` will have changed, but also another update because the opening the cover will also set the `online` property to false. For convenience, the `ThermalPrinterStatusInfo` object will be provided to the callback function as a parameter.


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

Please note that not all printers support every type of information. 


## Barcode scanner support

If your printer supports connecting a barcode scanner, you can also use this libary get access to the barcode scanner. This works very similar to the `WebHidBarcodeScanner` and `WebSerialBarcodeScanner` libraries, but instead of connecting directly to the barcode scanner, you would get the information from the printer instead.

Whenever the libary detects a barcode, it will send out a `barcode` event that you can listen for.

    printerStatus.addEventListener('barcode', barcode => {                
        console.log('Found barcode', barcode.value);
    });

The callback is passed an object with the following properties:

-   `value`<br>
    The value of the barcode as a string


## License

MIT

