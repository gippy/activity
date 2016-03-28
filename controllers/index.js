var Activity, async, config, env, fs, getDateQuery, getOptions, getPositions, getRandom, getRegions, moment, mongoose, parseActions, parseData, parseDays, parseFile, parseName, parseSheets, parseSummary, parseWeeks, saveFiles, xlsx;

env = process.env.NODE_ENV || 'development';

config = require('../config/config')[env];

moment = require('moment');

xlsx = require('node-xlsx');

fs = require('fs');

async = require('async');

mongoose = require('mongoose');

Activity = mongoose.model('Activity');

exports.accessDenied = function(req, res, next) {
  console.error('Denied access to address:' + req.ip);
  res.locals.hideScripts = true;
  return res.render('access-denied');
};

exports.checkIP = function(req, res, next) {
  if (config.ips.indexOf(req.ip) === -1) {
    return res.redirect('./access-denied');
  } else {
    return next();
  }
};

exports.setLocals = function(req, res, next) {
  res.locals.loggedIn = false;
  res.locals.hideScripts = false;
  return next();
};

exports.authenticate = function(req, res, next) {
  var j, len, password, ref, user;
  password = req.session.password;
  if (config.databases.indexOf(password) !== -1) {
    res.locals.loggedIn = 'user';
    res.locals.databases = [password];
    return next();
  } else {
    ref = config.users;
    for (j = 0, len = ref.length; j < len; j++) {
      user = ref[j];
      if (password === user.admin) {
        res.locals.loggedIn = 'admin';
        res.locals.databases = user.databases;
        return next();
      } else if (password === user.report) {
        res.locals.loggedIn = 'report';
        res.locals.databases = user.databases;
        return next();
      }
    }
  }
  return res.redirect('login');
};

exports.login = function(req, res, next) {
  return res.render('login');
};

exports.dashboard = function(req, res, next) {
  if (res.locals.databases.length === 1 && res.locals.loggedIn === 'report') {
    return res.redirect('./report?pass=' + res.locals.databases[0]);
  } else {
    return res.render('dashboard', {
      passwords: res.locals.loggedIn === 'admin' || res.locals.loggedIn === 'report' ? res.locals.databases : void 0
    });
  }
};

exports.performLogin = function(req, res, next) {
  var j, len, password, ref, user;
  password = req.body.password;
  if (config.databases.indexOf(password) !== -1) {
    res.locals.loggedIn = 'user';
    res.locals.databases = [password];
    req.session.password = password;
    return res.redirect('./dashboard');
  } else {
    ref = config.users;
    for (j = 0, len = ref.length; j < len; j++) {
      user = ref[j];
      if (password === user.admin) {
        res.locals.loggedIn = 'admin';
        res.locals.databases = user.databases;
        req.session.password = password;
        return res.redirect('./dashboard');
      } else if (password === user.report) {
        res.locals.loggedIn = 'report';
        res.locals.databases = user.databases;
        req.session.password = password;
        return res.redirect('./dashboard');
      }
    }
  }
  req.flash('error', 'Neplatné heslo!');
  return res.redirect('./login');
};

exports.logout = function(req, res, next) {
  req.session.destroy();
  return res.redirect('./login');
};

exports.download = function(req, res, next) {
  if (res.locals.loggedIn !== 'admin') {
    return res.redirect('./dashboard');
  } else {
    return Activity.find({
      password: req.query.pass
    }, 'region unit position name week date dayOfWeek planned current action').sort({
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
        return res.redirect('./dashboard');
      } else {
        data = [];
        data.push(['region', 'jednotka', 'pozice', 'jméno', 'týden', 'den', 'den v týdnu', 'plán', 'aktuálně', 'akce']);
        for (j = 0, len = activities.length; j < len; j++) {
          activity = activities[j];
          data.push([activity.region, activity.unit, activity.position, activity.name, activity.week, activity.date, activity.dayOfWeek, activity.planned, activity.current, activity.action]);
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
  }
};

parseName = function(name, dot) {
  var info, nameParts, type, unit;
  nameParts = name.substr(0, dot).split('_').filter(function(item) {
    return item.length > 0;
  });
  type = nameParts.shift().replace('Aktivity', '');
  info = {
    position: '',
    name: '',
    region: nameParts.shift(),
    unit: ''
  };
  if (type.length === 2 && type !== 'AG') {
    info.position = type;
  }
  if (!info.position) {
    info.position = 'FA';
  }
  unit = nameParts.shift();
  info.unit = unit === '999' ? '' : unit;
  info.name = nameParts.join(' ');
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

parseSummary = function(info, data, pass) {
  var cell, i, itemData, j, k, key, len, len1, realWeekData, ref, ref1, row, week;
  realWeekData = [];
  ref = data.summary.weeks;
  for (key = j = 0, len = ref.length; j < len; key = ++j) {
    cell = ref[key];
    if (!(key > 3 && cell)) {
      continue;
    }
    week = {
      week: cell,
      date: data.dates[cell]
    };
    ref1 = data.summary.sheet;
    for (i = k = 0, len1 = ref1.length; k < len1; i = ++k) {
      row = ref1[i];
      if (!(row.length && row[0] && row[0].length)) {
        continue;
      }
      itemData = {};
      itemData.password = pass;
      itemData.row = i;
      itemData.region = info.region;
      itemData.unit = info.unit;
      itemData.position = info.position;
      itemData.name = info.name;
      itemData.week = week.week;
      itemData.date = week.date;
      itemData.dayOfWeek = 'Po';
      itemData.planned = row.length >= key && row[key] ? row[key] : 0;
      itemData.current = row.length > key && row[key + 1] ? row[key + 1] : 0;
      itemData.action = row[0];
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

parseDays = function(actions, info, week, dates, data, pass) {
  var action, cell, count, day, firstDay, i, itemData, j, k, key, len, len1, realData, row;
  realData = [];
  firstDay = moment(dates[2] + '2016', "D.M.YYYY");
  count = 0;
  for (key = j = 0, len = dates.length; j < len; key = ++j) {
    cell = dates[key];
    if (!(key > 0 && cell && cell.length === 2)) {
      continue;
    }
    day = {
      week: week,
      day: firstDay.clone().add(count, 'd').format('YYYY-MM-DD'),
      dayOfWeek: cell
    };
    count++;
    for (i = k = 0, len1 = data.length; k < len1; i = ++k) {
      row = data[i];
      if (!(row.length && row[0] && row[0].length)) {
        continue;
      }
      itemData = {};
      itemData.password = pass;
      itemData.row = i;
      itemData.region = info.region;
      itemData.unit = info.unit;
      itemData.position = info.position;
      itemData.name = info.name;
      itemData.week = day.week;
      itemData.date = day.day;
      itemData.dayOfWeek = day.dayOfWeek;
      itemData.planned = row.length >= key && row[key] ? row[key] : 0;
      itemData.current = row.length > key && key <= 10 && row[key + 1] ? row[key + 1] : 0;
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

parseWeeks = function(actions, info, weeks, types, dates, data, pass) {
  var action, cell, i, itemData, j, k, key, len, len1, realWeekData, row, week;
  realWeekData = [];
  for (key = j = 0, len = weeks.length; j < len; key = ++j) {
    cell = weeks[key];
    if (!(key > 3 && cell)) {
      continue;
    }
    week = {
      week: cell,
      date: moment(dates[key] + '2016', "D.M.YYYY").format('YYYY-MM-DD')
    };
    for (i = k = 0, len1 = data.length; k < len1; i = ++k) {
      row = data[i];
      if (!(row.length && row[0] && row[0].length)) {
        continue;
      }
      itemData = {};
      itemData.password = pass;
      itemData.row = i;
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

parseSheets = function(info, actions, sheets, pass) {
  var agentData, data, dates, j, k, len, len1, sheet, types, weeks;
  data = [];
  if (info.position === 'FA') {
    agentData = {
      summary: [],
      dates: {}
    };
    for (j = 0, len = sheets.length; j < len; j++) {
      sheet = sheets[j];
      weeks = sheet.shift();
      dates = sheet.shift();
      types = sheet.shift();
      if (weeks.length > 5 && weeks[4]) {
        agentData.summary = {
          weeks: weeks,
          sheet: sheet
        };
      } else if (dates.length > 3 && weeks.length > 3) {
        agentData.dates[weeks[3]] = moment(dates[2] + '2016', "D.M.YYYY").format('YYYY-MM-DD');
      }
    }
    data.push(parseSummary(info, agentData, pass));
  } else {
    for (k = 0, len1 = sheets.length; k < len1; k++) {
      sheet = sheets[k];
      weeks = sheet.shift();
      dates = sheet.shift();
      types = sheet.shift();
    }
    data.push(parseWeeks(actions, info, weeks, dates, types, sheet, pass));
  }
  return data;
};

parseData = function(info, data, pass) {
  var actions, j, len, result, sheet, sheets;
  actions = {};
  sheets = [];
  result = [];
  for (j = 0, len = data.length; j < len; j++) {
    sheet = data[j];
    if (!(sheet.data && sheet.data.length > 0)) {
      continue;
    }
    sheet.name = sheet.name.replace(' POPIS', '');
    if (sheet.name === 'Aktivity_' + info.position) {
      actions = parseActions(sheet.data);
    } else if (sheet.data[0].length > 3 && sheet.data[0][4] !== '') {
      sheets.push(sheet.data);
    }
  }
  result = parseSheets(info, actions, sheets, pass);
  return result;
};

parseFile = function(file, pass, next) {
  var data, dot, info;
  dot = file.originalname.indexOf('.xlsx');
  if (dot === -1) {
    dot = file.originalname.indexOf('.xls');
  }
  if (dot === -1) {
    return next('Soubor ' + file.originalname + ' není excelový soubor.');
  } else {
    info = parseName(file.originalname, dot);
    data = parseData(info, xlsx.parse(fs.readFileSync(file.path)), pass);
    fs.unlinkSync(file.path);
    return next(null, data);
  }
};

saveFiles = function(req, data, next) {
  return async.each(data, function(file, cb) {
    return async.each(file, function(sheet, callback) {
      var conditions;
      if (sheet.length && sheet[0].week >= 0) {
        conditions = {
          position: sheet[0].position,
          region: sheet[0].region,
          unit: sheet[0].unit,
          name: sheet[0].name,
          week: sheet[0].week
        };
        return Activity.remove(conditions, function(err) {
          if (err) {
            return cb(err);
          } else {
            return Activity.create(sheet, callback);
          }
        });
      } else {
        return cb(null, []);
      }
    }, cb);
  }, next);
};

exports.upload = function(req, res, next) {
  if (!req.files || !req.files.length) {
    req.flash('error', 'Nebyla přijata data');
    return res.redirect('./dashboard');
  } else {
    return async.waterfall([
      function(callback) {
        return async.mapSeries(req.files, function(file, cb) {
          return parseFile(file, req.session.password, cb);
        }, callback);
      }, function(files, callback) {
        return saveFiles(req, files, callback);
      }
    ], function(err, data) {
      if (err) {
        req.flash('error', err);
        return res.redirect('./dashboard');
      } else {
        req.flash('success', 'Úspěšně uloženo.');
        return res.redirect('./dashboard');
      }
    });
  }
};

getRegions = function(next) {
  return Activity.distinct('region').exec(function(err, regions) {
    if (err) {
      return next(err);
    } else {
      regions.sort();
      return async.map(regions, function(item, cb) {
        var region;
        region = {
          region: item,
          label: item
        };
        return Activity.find({
          region: item
        }).distinct('unit').exec(function(err, units) {
          if (err) {
            return callback(err);
          } else {
            units = units.sort().map(function(item) {
              return {
                unit: item,
                label: item
              };
            });
            units = units.filter(function(item) {
              return item.unit !== '';
            });
            units.splice(0, 0, {
              unit: null,
              label: 'Vše'
            });
            region.units = units;
            return cb(null, region);
          }
        });
      }, next);
    }
  });
};

getPositions = function(next) {
  return Activity.distinct('position').exec(function(err, positions) {
    if (err) {
      return next(err);
    } else {
      positions.sort();
      return async.map(positions, function(item, cb) {
        var position;
        position = {
          position: item,
          label: item
        };
        return Activity.find({
          position: item
        }).distinct('action').exec(function(err, actions) {
          if (err) {
            return callback(err);
          } else {
            actions.sort();
            position.actions = actions;
            return cb(null, position);
          }
        });
      }, next);
    }
  });
};

getOptions = function(next) {
  return async.waterfall([
    function(cb) {
      return getRegions(cb);
    }, function(regions, cb) {
      return getPositions(function(err, positions) {
        var data;
        if (err) {
          return cb(err);
        } else {
          data = {
            regions: regions,
            positions: positions
          };
          return cb(null, data);
        }
      });
    }, function(data, cb) {
      data.periods = [
        {
          label: 'Včera',
          value: 'today',
          position: 'FA'
        }, {
          label: 'Tento týden',
          value: 'week',
          position: null
        }, {
          label: 'Minulý týden',
          value: 'last-week',
          position: null
        }, {
          label: 'Tento měsíc',
          value: 'month',
          position: null
        }, {
          label: 'Minulý měsíc',
          value: 'last-month',
          position: null
        }
      ];
      return cb(null, data);
    }
  ], next);
};

getDateQuery = function(from, to) {
  var now;
  now = moment();
  if (!from) {
    from = now.clone().startOf('isoWeek').format('YYYY-MM-DD');
  }
  if (!to) {
    to = now.clone().endOf('isoWeek').format('YYYY-MM-DD');
  }
  return {
    from: from,
    to: to
  };
};

exports.getData = function(req, res, next) {
  if (res.locals.loggedIn !== 'report') {
    return res.json({});
  } else {
    return getOptions(function(err, options) {
      var conditions, dateQuery, position;
      if (err) {
        console.log(err);
        return res.json({
          options: {},
          data: {
            users: [],
            actions: []
          }
        });
      } else {
        position = req.query.position;
        conditions = {
          password: req.query.pass
        };
        if (position) {
          conditions.position = position;
        }
        if (req.query.region && req.query.region !== 'null') {
          conditions.region = req.query.region;
        }
        if (req.query.unit && req.query.unit !== 'null') {
          conditions.unit = req.query.unit;
        }
        dateQuery = getDateQuery(req.query.from, req.query.to);
        conditions.date = {
          $gte: dateQuery.from,
          $lte: dateQuery.to
        };
        return Activity.find(conditions).sort({
          position: 1,
          row: 1
        }).exec(function(err, activities) {
          var action, actions, activity, count, data, j, label, len, realActionUsers, realActions, realUsers, ref, user, users;
          if (err) {
            console.log(err);
            return res.json({
              options: options,
              data: {
                users: {},
                actions: {}
              }
            });
          } else {
            users = {};
            actions = {};
            for (j = 0, len = activities.length; j < len; j++) {
              activity = activities[j];
              user = activity.name;
              action = activity.action;
              if (!users.hasOwnProperty(user)) {
                users[user] = 0;
              }
              if (!actions.hasOwnProperty(action)) {
                actions[action] = {
                  current: 0,
                  planned: 0,
                  max: {
                    value: 0,
                    user: null
                  },
                  count: 0,
                  users: {},
                  row: activity.row,
                  position: activity.position
                };
              }
              if (!actions[action].users.hasOwnProperty(user)) {
                actions[action].users[user] = 0;
              }
              if (!activity.planned) {
                activity.planned = 0;
              }
              if (!activity.current) {
                activity.current = 0;
              }
              users[user] += activity.current;
              actions[action].current += activity.current;
              actions[action].planned += activity.planned;
              actions[action].count++;
              actions[action].users[user] += activity.current;
              if (activity.current > actions[action].max.value) {
                actions[action].max = {
                  user: user,
                  value: activity.current
                };
              }
            }
            realUsers = [];
            for (user in users) {
              count = users[user];
              realUsers.push({
                user: user,
                count: count
              });
            }
            realUsers.sort(function(a, b) {
              if (a.count < b.count) {
                return 1;
              } else if (a.count > b.count) {
                return -1;
              } else {
                return 0;
              }
            });
            realActions = [];
            for (label in actions) {
              data = actions[label];
              realActionUsers = [];
              ref = data.users;
              for (user in ref) {
                count = ref[user];
                realActionUsers.push({
                  user: user,
                  count: count
                });
              }
              realActionUsers.sort(function(a, b) {
                if (a.count < b.count) {
                  return 1;
                } else if (a.count > b.count) {
                  return -1;
                } else {
                  return 0;
                }
              });
              realActions.push({
                label: label,
                row: data.row,
                position: data.position,
                current: Math.round(data.current / data.count),
                planned: Math.round(data.planned / data.count),
                max: data.max,
                users: realActionUsers.splice(0, 10)
              });
            }
            realActions.sort(function(a, b) {
              if (a.position < b.position) {
                return -1;
              } else if (a.position > b.position) {
                return 1;
              } else if (a.row < b.row) {
                return -1;
              } else if (a.row > b.row) {
                return 1;
              } else if (a.label < b.label) {
                return -1;
              } else if (a.label > b.label) {
                return 1;
              } else {
                return 0;
              }
            });
            return res.json({
              options: options,
              defaultFrom: dateQuery.from,
              defaultTo: dateQuery.to,
              data: {
                users: realUsers,
                actions: realActions
              }
            });
          }
        });
      }
    });
  }
};

exports.report = function(req, res, next) {
  if (res.locals.loggedIn !== 'report') {
    return res.redirect('./dashboard');
  } else {
    return res.render('reports');
  }
};

getRandom = function(length, next) {
  return require('crypto').randomBytes(length, function(ex, buf) {
    var token;
    token = buf.toString('hex');
    return next(token);
  });
};

exports.hash = function(req, res, next) {
  return getRandom(4, function(newPass) {
    return Activity.find({
      password: req.query.password
    }).distinct('name').exec(function(err, data) {
      if (err) {
        return next(err);
      } else {
        return async.forEachOf(data, function(name, key, cb) {
          return Activity.find({
            password: req.query.password
          }, function(err, items) {
            var newItems;
            if (err) {
              return cb(err);
            } else {
              newItems = items.map(function(item) {
                item = item.toObject();
                delete item.id;
                delete item._id;
                item.password = newPass;
                item.name = 'TEST_X_' + count;
                return item;
              });
              return Activity.create(newItems, function(err) {
                if (err) {
                  return cb(err);
                } else {
                  return cb();
                }
              });
            }
          });
        }, function(err) {
          if (err) {
            return next(err);
          } else {
            return res.redirect('./dashboard');
          }
        });
      }
    });
  });
};
