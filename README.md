[![OrangeBox Logo](http://msrv.su/i/OrangeBox.png)](https://github.com/mirrr/orangebox)   
Lightweight [Node.js](http://nodejs.org) web application framework on clusters with file server.
   
   

## How To Install   
```bash
npm install orangebox
```

   

## Getting Started
```js
var app = require('orangebox').app();

app.get('/', function (req, res) {
  res.send('Hello World');
});
app.listen(8080);
```
   

After run your web server will be working in 3 threads via clusters. To specify the number of threads use:   

```js
var count = 8;
var app = require('orangebox').app(count);
```
    
    
    
## Application    
  
  
### Routing

```js
// invoked for any requests passed to this router
router.use(function(req, res, next) {
  // .. some logic here ..
  next();
});

// Will handle all requests that reference a /test
app.get('/test/*', function (req, res) {
  //...
});

// Will handle all requests that reference a /test
app.get('/test', function (req, res) {
  //...
});

// used named keys
app.get('/user/:id/:method', function (req, res) {
  //...
});

// routing with regexp
app.get('/^\/commits\/(\w+)(?:\.\.(\w+))?$/', function (req, res) {
  //...
});
```
**Note:** *if your handler function has 3 parameters (with "next"), you should be use next(); in it body*   
   
   
### Middleware 
Mount the middleware function(s) at the path. If path is not specified, it defaults to "*".   
    
```js
// this middleware will be executed for every request to the app
app.use('*', function (req, res, next) {
  console.log('Time: %d', Date.now());
  next();
})
```
    
Middleware functions are executed sequentially, therefore the order of middleware inclusion is important.
    
```js
// this middleware will not allow the request to go beyond it
app.use(function(req, res, next) {
  res.send('Hello World');
})

// requests will never reach this route
app.get('/test', function (req, res) {
  res.send('Hello World 2');
})
```
    
An orangebox app is a valid middleware.
    
```js
var orangeBox = require('orangebox');
var app       = orangeBox.app();
var subApp    = orangeBox.app();

subApp.get('/news', function (req, res, next) {
  res.send('This news middleware');
});

app.use(subApp);
```
    
    

### File server
For this feature used [node-static](https://github.com/cloudhead/node-static) Server:
```js
var app = require('orangebox').app();

// Creating a file server for serving files under a directory
app.fileServer(__dirname + '/public');

app.get('/', function (req, res) {
  res.send('<img src="my.jpg" />');
});

// Transfer the file at the given path.  
app.get('/i/send.jpg', function (req, res) {
  res.sendFile(__dirname + '/public/send.jpg');
});

// Transfer the file as attachment at the given path. 
app.get('/i/attachment.jpg', function (req, res) {
  res.attachment(__dirname + '/public/send.jpg', "attachment.jpg");
});

// Serving files as attachments under a directory 
app.get('/attach/*.jpg', function (req, res) {
  res.attachment(__dirname + '/public/' + req.params[0] +'.jpg', "attachment-" + req.params[0] + ".jpg");
});

app.listen(8080);
```
Of course you need to put the pictures to the folder **./public**   

   
### File upload  
```js
var app = require('orangebox').app();

app.set('multiparty autoFiles', true);
app.set('multiparty maxFilesSize', 250000);
app.set('multiparty uploadDir', __dirname + '/admin/files');

app.get('/', function (req, res) {
  res.send('<form action="/upload" enctype="multipart/form-data" method="post">'+
    '<input type="text" name="title"><br>'+
    '<input type="file" name="upload" multiple="multiple"><br>'+
    '<input type="submit" value="Upload!">'+
    '</form>');
});
app.post('/upload', function (req, res) {
  res.send([req.files, req.body]);
});
app.listen(8080);
```


### Settings
Application settings variable can be set using app.set(), and retrieved using app.get(). The following settings are provided to alter how OrangeBox will behave:

* **env** Environment mode, defaults to process.env.NODE_ENV or "development"
* **case sensitive routing** Enable case sensitivity, disabled by default, treating "/Foo" and "/foo" as the same
* **strict routing** Enable strict routing, by default "/foo" and "/foo/" are treated the same by the router
* **view cache** Enables view template compilation caching, enabled in production by default
* **view engine** The default engine extension to use when omitted
* **views** The view directory path, defaulting to "process.cwd() + '/views'"
* **multiparty autoFiles** Enable additional uploading conditions.
* **multiparty maxFilesSize** Only relevant when `multiparty autoFiles` is true. Limits the total bytes accepted for all files combined. The default is Infinity.
* **multiparty uploadDir** Only relevant when `multiparty autoFiles` is true. The directory for placing file uploads in (must be created in advance). You can move them later using fs.rename(). Defaults to os.tmpDir().   
* **multiparty catchError** If _true_ - upload error transferred to the `req.body.multiparty_error`, otherwise it is transferred from server response to client. 


   
### Aliases In Routes

```js
app.alias('/favicon.ico', '/favicon-test.ico');
```
   
   
   
## People

Author and developer of OrangeBox is [Oleksiy Chechel](https://github.com/mirrr)   
   
[List of all contributors](https://github.com/mirrr/orangebox/graphs/contributors)



## License
   
MIT License   
   
Copyright (C) 2014 Oleksiy Chechel (alex.mirrr@gmail.com)   
   
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:   
   
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.   
   
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
