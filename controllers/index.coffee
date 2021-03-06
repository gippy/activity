env = process.env.NODE_ENV || 'development'
config = require('../config/config')[env]

moment = require 'moment'
xlsx = require 'node-xlsx'
fs = require 'fs'
async = require 'async'

mongoose = require 'mongoose'
Activity = mongoose.model 'Activity'

exports.accessDenied = (req, res, next) ->
	console.error('Denied access to address:' + req.ip)
	res.locals.hideScripts = true
	res.render 'access-denied'

exports.checkIP = (req,res, next) ->
	if config.ips.indexOf(req.ip) is -1 then res.redirect('./access-denied')
	else next()

exports.setLocals = (req, res, next) ->
	res.locals.loggedIn = false
	res.locals.hideScripts = false
	next()

exports.authenticate = (req, res, next) ->
	password = req.session.password
	if config.databases.indexOf(password) isnt -1
		res.locals.loggedIn = 'user'
		res.locals.databases = [password]
		return next()
	else
		for user in config.users
			if password is user.admin
				res.locals.loggedIn = 'admin'
				res.locals.databases = user.databases
				return next()
			else if password is user.report
				res.locals.loggedIn = 'report'
				res.locals.databases = user.databases
				return next()
	res.redirect 'login'

exports.login = (req, res, next) -> res.render 'login'
exports.dashboard = (req, res, next) ->
	if res.locals.databases.length is 1 and res.locals.loggedIn is 'report'
		res.redirect './report?pass='+res.locals.databases[0]
	else
		res.render 'dashboard', {passwords: if res.locals.loggedIn is 'admin' or res.locals.loggedIn is 'report' then res.locals.databases}

exports.performLogin = (req, res, next) ->
	password = req.body.password
	if config.databases.indexOf(password) isnt -1
		res.locals.loggedIn = 'user'
		res.locals.databases = [password]
		req.session.password = password
		return res.redirect './dashboard'
	else
		for user in config.users
			if password is user.admin
				res.locals.loggedIn = 'admin'
				res.locals.databases = user.databases
				req.session.password = password
				return res.redirect './dashboard'
			else if password is user.report
				res.locals.loggedIn = 'report'
				res.locals.databases = user.databases
				req.session.password = password
				return res.redirect './dashboard'

	req.flash('error', 'Neplatné heslo!')
	res.redirect './login'

exports.logout = (req, res, next) ->
	req.session.destroy();
	res.redirect './login'

exports.download = (req, res, next) ->
	if res.locals.loggedIn != 'admin' then res.redirect './dashboard'
	else
		Activity
			.find({password: req.query.pass}, 'region unit position name week date dayOfWeek planned current action')
			.sort({region: 1, unit: 1, name: 1, week: 1, date: 1, action: 1})
			.exec (err, activities)->
				if err
					req.flash 'error', 'Nepodařilo získat data z databáze.'
					res.redirect './dashboard'
				else
					data = []
					data.push ['region', 'jednotka', 'pozice', 'jméno', 'týden', 'den', 'den v týdnu', 'plán', 'aktuálně', 'akce']
					for activity in activities
						data.push [activity.region, activity.unit, activity.position, activity.name, activity.week, activity.date, activity.dayOfWeek, activity.planned, activity.current, activity.action]

					buffer = xlsx.build [{name: 'Záznamy', data: data}]
					res.attachment('datasheet.xlsx');
					res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
					return res.send buffer

parseName = (name, dot) ->
	nameParts = name.substr(0, dot).split('_').filter (item) -> item.length > 0
	type = nameParts.shift().replace('Aktivity', '')
	info = {
		position: '',
		name: '',
		region: nameParts.shift(),
		unit: ''
	}
	if type.length is 2 and type isnt 'AG' then info.position = type
	if !info.position then info.position = 'FA'
	unit = nameParts.shift()
	info.unit = if unit is '999' then '' else unit
	info.name = nameParts.join(' ')

	return info

parseActions = (actions) ->
	result = {}
	actions.shift()
	for action in actions
		item = {}
		if action.length is 4
			item.process = action[0]
			item.step = action[1]
			item.description = action[3]
			result[action[2]] = item
		else
			item.process = action[0]
			item.description = action[2]
			result[action[1]] = item
	return result

parseSummary = (info, data, pass) ->
	realWeekData = []
	for cell, key in data.summary.weeks when key > 3 and cell
		week = {
			week: cell,
			date: data.dates[cell]
		}
		for row, i in data.summary.sheet when row.length and row[0] and row[0].length
			itemData = {}
			itemData.password = pass
			itemData.row = i
			itemData.region = info.region
			itemData.unit = info.unit
			itemData.position = info.position
			itemData.name = info.name
			itemData.week = week.week
			itemData.date = week.date
			itemData.dayOfWeek = 'Po'
			itemData.planned = if row.length >= key and row[key] then row[key] else 0
			itemData.current = if row.length > key and row[key+1] then row[key+1] else 0
			itemData.action = row[0]
			realWeekData.push(itemData)

	realWeekData.sort (a, b) ->
		if a[4] > b[4] then return -1
		else if a[4] < b[4] then return 1
		else return 0
	return realWeekData

parseDays = (actions, info, week, dates, data, pass) ->
	realData = []
	firstDay = moment(dates[2] + '2016', "D.M.YYYY")
	count = 0
	for cell, key in dates when key > 0 and cell and cell.length is 2
		day = {
			week: week,
			day: firstDay.clone().add(count, 'd').format('YYYY-MM-DD'),
			dayOfWeek: cell
		}
		count++
		for row, i in data when row.length and row[0] and row[0].length
			itemData = {}
			itemData.password = pass
			itemData.row = i
			itemData.region = info.region
			itemData.unit = info.unit
			itemData.position = info.position
			itemData.name = info.name
			itemData.week = day.week
			itemData.date = day.day
			itemData.dayOfWeek = day.dayOfWeek
			itemData.planned = if row.length >= key and row[key] then row[key] else 0
			itemData.current = if row.length > key and key <= 10 and row[key+1] then row[key+1] else 0
			itemData.action = row[0]
			action = actions[row[0]]
			if action
				itemData.process = action.process
				itemData.step = action.step
			else
				itemData.process = ''
				itemData.step = ''
			realData.push(itemData)
	realData.sort (a, b) ->
		if a[4] > b[4] then return -1
		else if a[4] < b[4] then return 1
		else return 0
	return realData

parseWeeks = (actions, info, weeks, types, dates, data, pass) ->
	realWeekData = []
	for cell, key in weeks when key > 3 and cell
		week = {
			week: cell,
			date: moment(dates[key] + '2016', "D.M.YYYY").format('YYYY-MM-DD'),
		}
		for row, i in data when row.length and row[0] and row[0].length
			itemData = {}
			itemData.password = pass
			itemData.row = i
			itemData.region = info.region
			itemData.unit = info.unit
			itemData.position = info.position
			itemData.name = info.name
			itemData.week = week.week
			itemData.date = week.date
			itemData.dayOfWeek = 'Po'
			itemData.planned = if row.length >= key and row[key] then row[key] else 0
			itemData.current = if row.length > key and row[key] then row[key+1] else 0
			itemData.action = row[0]
			action = actions[row[0]]
			if action
				itemData.process = action.process
				itemData.step = action.step
			else
				itemData.process = ''
				itemData.step = ''
			realWeekData.push(itemData)

	realWeekData.sort (a, b) ->
		if a[4] > b[4] then return -1
		else if a[4] < b[4] then return 1
		else return 0
	return realWeekData

parseSheets = (info, actions, sheets, pass) ->
	data = []

	if info.position is 'FA'
		agentData = {
			summary: []
			dates: {}
		}
		for sheet in sheets
			weeks = sheet.shift()
			dates = sheet.shift()
			types = sheet.shift()
			if weeks.length > 5 and weeks[4] then agentData.summary = {weeks: weeks, sheet: sheet}
			else if dates.length > 3 and weeks.length > 3 then agentData.dates[weeks[3]] = moment(dates[2] + '2016', "D.M.YYYY").format('YYYY-MM-DD')
		data.push(parseSummary(info, agentData, pass))
	else
		for sheet in sheets
			weeks = sheet.shift()
			dates = sheet.shift()
			types = sheet.shift()
		data.push(parseWeeks(actions, info, weeks, dates, types, sheet, pass))

	return data

parseData = (info, data, pass) ->
	actions= {}
	sheets = []
	result = []
	for sheet in data when sheet.data and sheet.data.length > 0
		sheet.name = sheet.name.replace(' POPIS', '')
		if sheet.name is 'Aktivity_'+info.position then actions = parseActions(sheet.data)
		else if sheet.data[0].length > 3 and sheet.data[0][4] != ''
			sheets.push sheet.data

	result = parseSheets(info, actions, sheets, pass)
	return result

parseFile = (file, pass, next) ->
	dot = file.originalname.indexOf('.xlsx')
	if dot is -1 then dot = file.originalname.indexOf('.xls')

	if dot is -1 then next('Soubor ' + file.originalname + ' není excelový soubor.')
	else
		info = parseName(file.originalname, dot)
		data = parseData(info, xlsx.parse(fs.readFileSync(file.path)), pass)
		fs.unlinkSync(file.path)
		next(null, data)

saveFiles = (req, data, next) ->
	async.each(
		data
		(file, cb) ->
			async.each(
				file,
				(sheet, callback) ->
					if sheet.length and sheet[0].week >= 0
						conditions = {
							position: sheet[0].position,
							region: sheet[0].region,
							unit: sheet[0].unit,
							name: sheet[0].name,
							week: sheet[0].week
						}
						Activity.remove conditions, (err) ->
							if err then cb(err)
							else Activity.create sheet, callback
					else cb(null, [])
				cb
			)
		next
	)

exports.upload = (req, res, next) ->
	if !req.files or !req.files.length
		req.flash('error', 'Nebyla přijata data')
		res.redirect('./dashboard')
	else
		async.waterfall(
			[
				(callback) ->
					async.mapSeries(
						req.files
						(file, cb) ->	parseFile(file, req.session.password, cb)
						callback
					)
				(files, callback) -> saveFiles(req, files, callback)
			],
			(err, data) ->
				if err
					req.flash('error', err)
					res.redirect('./dashboard')
				else
					req.flash('success', 'Úspěšně uloženo.')
					res.redirect('./dashboard')
		)

getRegions = (next) ->
	Activity.distinct('region').exec (err, regions) ->
		if err then next(err)
		else
			regions.sort()
			async.map(
				regions
				(item, cb) ->
					region = {region: item, label: item}
					Activity.find({region: item}).distinct('unit').exec (err, units) ->
						if err then callback(err)
						else
							units = units.sort().map (item) -> return {unit: item, label: item}
							units = units.filter (item) -> return item.unit isnt ''
							units.splice(0,0,{unit:null, label: 'Vše'})
							region.units = units
							cb(null, region)
				next
			)

getPositions = (next) ->
	Activity.distinct('position').exec (err, positions) ->
		if err then next(err)
		else
			positions.sort()
			async.map(
				positions
				(item, cb) ->
					position = {position: item, label: item}
					Activity.find({position: item}).distinct('action').exec (err, actions) ->
						if err then callback(err)
						else
							actions.sort()
							position.actions = actions
							cb(null, position)
				next
			)

getOptions = (next) ->
	async.waterfall(
		[
			(cb) -> getRegions(cb)
			(regions, cb) ->
				getPositions (err, positions) ->
					if err then cb(err)
					else
						data = {
							regions: regions
							positions: positions
						}
						cb(null, data)
			(data, cb) ->
				data.periods = [
					{ label: 'Včera', value: 'today', position: 'FA' },
					{ label: 'Tento týden', value: 'week', position: null },
					{ label: 'Minulý týden', value: 'last-week', position: null },
					{ label: 'Tento měsíc', value: 'month', position: null },
					{ label: 'Minulý měsíc', value: 'last-month', position: null },
				]
				cb(null, data)
		],
		next
	)

getDateQuery = (from, to) ->
	now = moment()
	if !from then from = now.clone().startOf('isoWeek').format('YYYY-MM-DD')
	if !to then to = now.clone().endOf('isoWeek').format('YYYY-MM-DD')
	return { from: from, to: to }

exports.getData = (req, res, next) ->
	if res.locals.loggedIn != 'report' then res.json {}
	else
		getOptions (err, options) ->
			if err
				console.log err
				res.json {options: {}, data: {users: [], actions: []}}
			else
				position = req.query.position
				conditions = {
					password: req.query.pass
				}

				if position then conditions.position = position
				if req.query.region and req.query.region isnt 'null' then conditions.region = req.query.region
				if req.query.unit and req.query.unit isnt 'null'  then conditions.unit = req.query.unit

				dateQuery = getDateQuery(req.query.from, req.query.to)
				conditions.date = {$gte: dateQuery.from, $lte: dateQuery.to}

				Activity.find(conditions).sort({position: 1, row: 1}).exec (err, activities) ->
					if err
						console.log err
						res.json {options: options, data: {users: {}, actions: {}}}
					else
						users = {}
						actions = {}
						for activity in activities
							user = activity.name
							action = activity.action

							if !users.hasOwnProperty(user) then users[user] = 0
							if !actions.hasOwnProperty(action) then actions[action] = {
								current: 0,
								planned: 0,
								max: {value: 0, user: null},
								count: 0,
								users: {},
								row: activity.row,
								position: activity.position
							}
							if !actions[action].users.hasOwnProperty(user) then actions[action].users[user] = 0

							if !activity.planned then activity.planned = 0
							if !activity.current then activity.current = 0

							users[user] += activity.current

							actions[action].current += activity.current
							actions[action].planned += activity.planned
							actions[action].count++

							actions[action].users[user] += activity.current

							if activity.current > actions[action].max.value then actions[action].max = {user: user, value: activity.current}

						realUsers = []
						realUsers.push {user: user, count: count} for user, count of users
						realUsers.sort (a, b) -> if a.count < b.count then 1 else if a.count > b.count then -1 else 0

						realActions = []
						for label, data of actions
							realActionUsers = []
							realActionUsers.push {user: user, count: count} for user, count of data.users
							realActionUsers.sort (a, b) -> if a.count < b.count then 1 else if a.count > b.count then -1 else 0

							realActions.push {
								label: label
								row: data.row
								position: data.position
								current: Math.round(data.current/data.count)
								planned: Math.round(data.planned/data.count)
								max: data.max,
								users: realActionUsers.splice(0,10)
							}

						realActions.sort (a,b) ->
							if a.position < b.position then -1
							else if a.position > b.position then 1
							else if a.row < b.row then -1
							else if a.row > b.row then 1
							else if a.label < b.label then -1
							else if a.label > b.label then 1
							else 0

						res.json {
							options: options,
							defaultFrom: dateQuery.from
							defaultTo: dateQuery.to
							data: {
								users: realUsers,
								actions: realActions
							}
						}

exports.report = (req, res, next) ->
	if res.locals.loggedIn != 'report' then res.redirect './dashboard'
	else res.render 'reports'

getRandom = (length, next) -> require('crypto').randomBytes length, (ex, buf) ->
	token = buf.toString('hex')
	next(token)

exports.hash = (req, res, next) ->
	getRandom 4, (newPass) ->
		Activity.find({password: req.query.password}).distinct('name').exec (err, data) ->
			if err then next(err)
			else
				async.forEachOf(
					data,
					(name, key, cb) ->
						Activity.find {password:req.query.password}, (err, items) ->
							if err then cb(err)
							else
								newItems = items.map (item) ->
									item = item.toObject()
									delete item.id
									delete item._id
									item.password = newPass
									item.name = 'TEST_X_' + count
									return item


								Activity.create newItems, (err) ->
									if err then cb(err)
									else cb()

					(err) ->
						if err then next(err)
						else res.redirect('./dashboard')
				)
