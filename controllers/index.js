var Activity, async, config, env, fs, moment, mongoose, parseActions, parseData, parseDays, parseFile, parseName, parseSheets, parseWeeks, saveFiles, xlsx;

env = process.env.NODE_ENV || 'development';

config = require('../config/config')[env];

moment = require('moment');

xlsx = require('node-xlsx');

fs = require('fs');

async = require('async');

mongoose = require('mongoose');

Activity = mongoose.model('Activity');

exports.setLocals = function(req, res, next) {
  res.locals.loggedIn = false;
  return next();
};

exports.authenticate = function(req, res, next) {
  var password;
  password = req.session.password;
  if (password === config.password.admin) {
    res.locals.loggedIn = 'admin';
    return next();
  } else if (config.password.users.indexOf(password) !== -1) {
    res.locals.loggedIn = 'user';
    return next();
  } else {
    return res.redirect('login');
  }
};

exports.login = function(req, res, next) {
  return res.render('login');
};

exports.dashboard = function(req, res, next) {
  return res.render('dashboard', {
    passwords: res.locals.loggedIn === 'admin' ? config.password.users : []
  });
};

exports.performLogin = function(req, res, next) {
  var password;
  password = req.body.password;
  if (password === config.password.admin) {
    req.session.password = password;
    res.locals.loggedIn = 'admin';
    return res.redirect('/dashboard');
  } else if (config.password.users.indexOf(password) !== -1) {
    req.session.password = password;
    res.locals.loggedIn = 'user';
    return res.redirect('/dashboard');
  } else {
    req.flash('error', 'Neplatné heslo!');
    return res.redirect('/login');
  }
};

exports.logout = function(req, res, next) {
  req.session.destroy();
  return res.redirect('/login');
};

exports.download = function(req, res, next) {
  return Activity.find({
    password: req.query.pass
  }, 'region unit position name week date dayOfWeek planned current action process step').sort({
    region: 1,
    unit: 1,
    name: 1,
    week: 1,
    date: 1,
    action: 1
  }).exec(function(err, activities) {
    var activity, buffer, data, j, len;
    if (err) {
      req.flash('error', 'Nepodařilo získat data z databáze.');
      return res.redirect('/dashboard');
    } else {
      data = [];
      data.push(['region', 'jednotka', 'pozice', 'jméno', 'týden', 'den', 'den v týdnu', 'plán', 'aktuálně', 'akce', 'proces', 'krok v procesu']);
      for (j = 0, len = activities.length; j < len; j++) {
        activity = activities[j];
        data.push([activity.region, activity.unit, activity.position, activity.name, activity.week, activity.date, activity.dayOfWeek, activity.planned, activity.current, activity.action, activity.process, activity.step]);
      }
      buffer = xlsx.build([
        {
          name: 'Záznamy',
          data: data
        }
      ]);
      res.attachment('datasheet.xlsx');
      res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);
    }
  });
};

parseName = function(name, dot) {
  var info, nameParts, type;
  nameParts = name.substr(0, dot).split('_').filter(function(item) {
    return item.length > 0;
  });
  type = nameParts.shift();
  info = {
    position: '',
    name: '',
    region: nameParts.shift(),
    unit: ''
  };
  if (type.indexOf('MP') !== -1) {
    info.position = 'MP';
    info.name = nameParts.join(' ');
  } else if (type.indexOf('SP') !== -1) {
    info.position = 'SP';
    info.name = nameParts.join(' ');
  } else if (type.indexOf('UM') !== -1) {
    info.position = 'UM';
    info.unit = nameParts.shift();
    info.name = nameParts.join(' ');
  } else {
    info.position = 'FA';
    info.unit = nameParts.shift();
    info.name = nameParts.join(' ');
  }
  return info;
};

parseActions = function(actions) {
  var action, item, j, len, result;
  result = {};
  actions.shift();
  for (j = 0, len = actions.length; j < len; j++) {
    action = actions[j];
    item = {};
    if (action.length === 4) {
      item.process = action[0];
      item.step = action[1];
      item.description = action[3];
      result[action[2]] = item;
    } else {
      item.process = action[0];
      item.description = action[2];
      result[action[1]] = item;
    }
  }
  return result;
};

parseDays = function(actions, info, week, dates, data) {
  var action, cell, day, firstDay, itemData, j, k, key, len, len1, realData, row;
  realData = [];
  firstDay = moment(dates[2] + '2016', "D.M.YYYY");
  for (key = j = 0, len = dates.length; j < len; key = ++j) {
    cell = dates[key];
    if (!(key > 1 && cell && cell.length === 2)) {
      continue;
    }
    day = {
      week: week,
      day: firstDay.clone().add(key - 1, 'd').format('YYYY-MM-DD'),
      dayOfWeek: cell
    };
    for (k = 0, len1 = data.length; k < len1; k++) {
      row = data[k];
      itemData = {};
      itemData.region = info.region;
      itemData.unit = info.unit;
      itemData.position = info.position;
      itemData.name = info.name;
      itemData.week = day.week;
      itemData.date = day.day;
      itemData.dayOfWeek = day.dayOfWeek;
      itemData.planned = row.length >= key && row[key] ? row[key] : 0;
      itemData.current = row.length > key && key <= 10 && row[key] ? row[key + 1] : 0;
      itemData.action = row[0];
      action = actions[row[0]];
      if (action) {
        itemData.process = action.process;
        itemData.step = action.step;
      } else {
        itemData.process = '';
        itemData.step = '';
      }
      realData.push(itemData);
    }
  }
  realData.sort(function(a, b) {
    if (a[4] > b[4]) {
      return -1;
    } else if (a[4] < b[4]) {
      return 1;
    } else {
      return 0;
    }
  });
  return realData;
};

parseWeeks = function(actions, info, weeks, types, dates, data) {
  var action, cell, itemData, j, k, key, len, len1, realWeekData, row, week;
  realWeekData = [];
  console.log(weeks, dates);
  for (key = j = 0, len = weeks.length; j < len; key = ++j) {
    cell = weeks[key];
    if (!(key > 3 && cell)) {
      continue;
    }
    week = {
      week: cell,
      date: moment(dates[key] + '2016', "D.M.YYYY").format('YYYY-MM-DD')
    };
    console.log(cell, dates[key]);
    for (k = 0, len1 = data.length; k < len1; k++) {
      row = data[k];
      itemData = {};
      itemData.region = info.region;
      itemData.unit = info.unit;
      itemData.position = info.position;
      itemData.name = info.name;
      itemData.week = week.week;
      itemData.date = week.date;
      itemData.dayOfWeek = 'Po';
      itemData.planned = row.length >= key && row[key] ? row[key] : 0;
      itemData.current = row.length > key && row[key] ? row[key + 1] : 0;
      itemData.action = row[0];
      action = actions[row[0]];
      if (action) {
        itemData.process = action.process;
        itemData.step = action.step;
      } else {
        itemData.process = '';
        itemData.step = '';
      }
      realWeekData.push(itemData);
    }
  }
  realWeekData.sort(function(a, b) {
    if (a[4] > b[4]) {
      return -1;
    } else if (a[4] < b[4]) {
      return 1;
    } else {
      return 0;
    }
  });
  return realWeekData;
};

parseSheets = function(info, actions, sheets) {
  var data, dates, i, j, k, len, ref, rows, sheet, types, usefulRows, weeks;
  data = [];
  rows = Object.keys(actions).length;
  for (j = 0, len = sheets.length; j < len; j++) {
    sheet = sheets[j];
    weeks = sheet.shift();
    dates = sheet.shift();
    types = sheet.shift();
    usefulRows = [];
    for (i = k = 0, ref = rows - 1; 0 <= ref ? k < ref : k > ref; i = 0 <= ref ? ++k : --k) {
      usefulRows.push(sheet[i]);
    }
    data = data.concat(info.position === 'FA' ? parseDays(actions, info, weeks[3], dates, usefulRows) : parseWeeks(actions, info, weeks, dates, types, usefulRows));
  }
  return data;
};

parseData = function(info, data) {
  var actions, j, len, result, sheet, sheets;
  actions = {};
  sheets = [];
  result = [];
  for (j = 0, len = data.length; j < len; j++) {
    sheet = data[j];
    sheet.name = sheet.name.replace(' POPIS', '');
    if (sheet.name === 'Aktivity_' + info.position) {
      actions = parseActions(sheet.data);
    } else if (sheet.data[0].length > 3 && sheet.data[0][4] !== '') {
      if (info.position === 'FA' && sheet.data[0].length > 6 && sheet.data[0][7] !== '') {
        continue;
      } else {
        sheets.push(sheet.data);
      }
    }
  }
  result = parseSheets(info, actions, sheets);
  return result;
};

parseFile = function(file, next) {
  var data, dot, info;
  dot = file.originalname.indexOf('.xlsx');
  if (dot === -1) {
    return next('Soubor ' + file.originalname + ' není excelový soubor.');
  } else {
    info = parseName(file.originalname, dot);
    data = parseData(info, xlsx.parse(file.path));
    fs.unlinkSync(file.path);
    return next(null, data);
  }
};

saveFiles = function(req, data, next) {
  return async.each(data, function(file, cb) {
    return async.each(file, function(item, callback) {
      item.password = req.session.password;
      return Activity.updateOrCreate(item, callback);
    }, cb);
  }, next);
};

exports.upload = function(req, res, next) {
  if (!req.files || !req.files.length) {
    req.flash('error', 'Nebyla přijata data');
    return res.redirect('/dashboard');
  } else {
    return async.waterfall([
      function(callback) {
        return async.mapSeries(req.files, function(file, cb) {
          return parseFile(file, cb);
        }, callback);
      }, function(files, callback) {
        return saveFiles(req, files, callback);
      }
    ], function(err, data) {
      if (err) {
        req.flash('error', err);
        return res.redirect('/dashboard');
      } else {
        req.flash('success', 'Úspěšně uloženo.');
        return res.redirect('/dashboard');
      }
    });
  }
};
