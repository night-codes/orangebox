[![OrangeBox Logo](http://msrv.su/i/OrangeBox.png)](https://github.com/mirrr/orangebox)   
Легковісний [Node.js](http://nodejs.org) веб-фреймворк на основі кластерів з вбудованим файловим сервером.
   
   

## Інсталяція   
```bash
npm install orangebox
```
   


## Початок роботи
```js
var app = require('orangebox').app();

app.get('/', function (req, res) {
  res.send('Hello World');
});
app.listen(8080);
```
   

Після запуску веб-сервер працюватиме в 3 потоки через кластери. Щоб вказати кількість потоків використовуйте:   

```js
var count = 8;
var app = require('orangebox').app(count);
```
    
    
    
## Веб-додаток    
  
  
### Маршрутизація

```js
// Викликається для будь-яких запитів на маршрутизаторі
router.use(function(req, res, next) {
  // .. якась логіка ..
  next();
});

// Оброблятимуться всі запити, які посилаються на /test/...
// На місці зірочки можуть бути будь-якi данні, які попадуть
// до req.params[0]
app.get('/test/*', function (req, res) {
  // ...
  // console.log(req.params[0]);
});

// Оброблятимуться всі запити, які посилаються на /test або /test/
app.get('/test', function (req, res) {
  // ...
});

// Використання названих ключів
app.get('/user/:id/:method', function (req, res) {
  // ...
  // console.log(req.params["id"]);
  // console.log(req.params["method"]);
});

// Маршрутизація за допомогою регулярних виразів
app.get('/^\/commits\/(\w+)(?:\.\.(\w+))?$/', function (req, res) {
  //...
});
```
**Note:** *функція-колбек може містити 3 параметри (третій необов’язковий параметр "next" у першому прикладі). В цьому випадку ви повинні визвати next() в тілі функції для запобігання втрат пам'яті. Якщо третій параметр не оголошений, спрацює автоматична очистка пам’яті після res.send()*
   
   
   
### Проміжне ПО
Монтування проміжних функцій. Якщо шлях не вказано, він буде "*" за замовчуванням.

```js
// ця функція буде виконана при будь-якому запиті в цьому веб-додатку
app.use('*', function (req, res, next) {
  console.log('Time: %d', Date.now());
  next();
})
```
   
Функції виконуються послідовно, тому порядок їх включення важливий.
   
```js
// ця функція не дозволить запиту вийти за його межі
app.use(function(req, res, next) {
  res.send('Hello World');
})

// запити ніколи не досягнуть цього маршруту
app.get('/test', function (req, res) {
  res.send('Hello World 2');
})
```

Ви можете використовувати orangebox додаток як промiжний до основного:
    
```js
var orangeBox = require('orangebox');
var app       = orangeBox.app();
var subApp    = orangeBox.app();

subApp.get('/news', function (req, res, next) {
  res.send('This news middleware');
});

app.use(subApp);
```
    
    
    
### Файловий сервер
Для надання цієї можливості використовується модуль [node-static](https://github.com/cloudhead/node-static):
```js
var app = require('orangebox').app();

// Створення файлового серверу
// Можливо створення кількох серверів для різних тек, при пошуку файлів 
// використовуються всі теки в черзі. Необов'язковий другий параметр
// задає можливість розшарити підтеку.
app.fileServer(__dirname + '/public');

app.get('/', function (req, res) {
  res.send('<img src="my.jpg" />');
});

// Передача файлу по даному шляху.
app.get('/i/send.jpg', function (req, res) {
  res.sendFile(__dirname + '/public/send.jpg');
});

// Передача файлу по даному шляху як вкладення. 
app.get('/i/attachment.jpg', function (req, res) {
  res.attachment(__dirname + '/public/send.jpg', "attachment.jpg");
});

// Обслуговування файлів в вигляді вкладень за заданої директорії
app.get('/attach/*.jpg', function (req, res) {
  res.attachment(__dirname + '/public/' + req.params[0] +'.jpg', 
    "attachment-" + req.params[0] + ".jpg");
});

app.listen(8080);
```
Звісно, ви повинні покласти зображення до теки **./public**   
 

### Завантаження файлів на сервер
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



### Налаштування
Змінні налаштувань веб-додатка можуть бути встановлені ​​за допомогою app.set(), і прочитані за допомогою app.get(). Наступні налаштування призначені для зміни поведінки OrangeBox:

* **env** Налаштування середовища, за замовчуванням: process.env.NODE_ENV або "development"
* **case sensitive routing** Включити чутливість до регістру, за замовчуванням вимкнено, маршрутизація однакова при "/Foo" або "/foo"
* **strict routing** Увімкнути строгу маршрутизацію, за умовчанням "/foo" і "/foo/" трактуються маршрутизатором однаково
* **view cache** Увімкнути кеш для шаблонізатора, включений в production за замовчуванням
* **view engine** Дефолтний рушій веб-додатку. 
* **views** Шлях перегляду каталогів, за замовчуванням "process.cwd() + '/views'"   
* **multiparty autoFiles** Вмикає додатковi умови завантаження.
* **multiparty maxFilesSize** Береться до уваги, коли `multiparty autoFiles` дорiвнює _true_. Обмежує загальну кількість байтів, прийнятих для всіх файлів разом узятих. За замовчуванням - нескінченність.
* **multiparty uploadDir** Береться до уваги, коли `multiparty autoFiles` дорiвнює _true_. Каталог для розміщення завантаженних файлів (повинен бути створений заздалегідь). Згодом ви можете переміщати їх за допомогою fs.rename(). За замовчуванням - os.tmpDir(). 
* **multiparty catchError** Якщо _true_ - помилка завантаження передається у `req.body.multiparty_error`, iнакше - вiддається з вiдповiддю сервера.
   
   
### Псевдоніми в маршрутизації

```js
app.alias('/favicon.ico', '/favicon-test.ico');
```
   
   
   
## Розробники

Автор та розробник OrangeBox - [Олексій Чечель](https://github.com/mirrr)   
   
[Всі розробники](https://github.com/mirrr/orangebox/graphs/contributors)   
   
   
   
## Ліцензія
   
Ліцензія MIT (Оригінальний текст додано)
   
Copyright (C) 2014 Oleksiy Chechel (alex.mirrr@gmail.com)   
   
Ця ліцензія дозволяє будь-якій особі, що отримала копію даного програмного забезпечення та супутньої документації (в подальшому "Програмне забезпечення"), безкоштовно використовувати Програмне забезпечення без обмежень, в тому числі, без обмежень, прав на використання, копіювання, змінювання, доповнення, публікацію, поширення, субліцензування та / або продаж копій Програмного забезпечення, також як і особам, яким надається дане Програмне забезпечення, при дотриманні наступних умов:

Вищезгадані авторські права і дані умови мають бути включені у всі копії або значущі частини даного Програмного забезпечення.

ДІЙСНЕ ПРОГРАМНЕ ЗАБЕЗПЕЧЕННЯ НАДАЄТЬСЯ «ЯК Є», БЕЗ ГАРАНТІЙ БУДЬ-ЯКОГО ВИДУ, ВИРАЖЕНИХ ЧИ ДОМИСЛЕНИХ, ВКЛЮЧАЮЧИ, АЛЕ НЕ ОБМЕЖУЮЧИСЬ, ГАРАНТІЯМИ КОМЕРЦІЙНОЇ ВИГОДИ, ВІДПОВІДНОСТІ ЙОГО КОНКРЕТНОМУ ПРИЗНАЧЕННЮ І ВІДСУТНОСТІ ПОРУШЕННЯ ПРАВ. В ЖОДНОМУ РАЗІ АВТОРИ АБО ВЛАСНИКИ АВТОРСЬКИХ ПРАВ НЕ ВІДПОВІДАЮТЬ ЗА БУДЬ-ЯКИМИ СУДОВИМИ ПОЗОВАМИ, ЩОДО ЗБИТКІВ, ЧИ ТО ІНШИХ ПРЕТЕНЗІЙ, ЧИ ДІЙ ДОГОВОРУ, ЦИВІЛЬНОГО ПРАВОПОРУШЕННЯ АБО ІНШИХ, ЩО ВИНИКАЮТЬ ПОЗА, АБО У ЗВ'ЯЗКУ З ПРОГРАМНИМ ЗАБЕЗПЕЧЕННЯМ АБО ВИКОРИСТАННЯМ ЧИ ІНШИМИ ДІЯМИ ПРОГРАМНОГО ЗАБЕЗПЕЧЕННЯ.
