env = process.env.NODE_ENV || 'development'
config = require('../config/config')[env]

moment = require 'moment'
xlsx = require 'node-xlsx'
fs = require 'fs'
async = require 'async'

mongoose = require 'mongoose'
Activity = mongoose.model 'Activity'

exports.setLocals = (req, res, next) ->
	res.locals.loggedIn = false
	next()

exports.authenticate = (req, res, next) ->
	password = req.session.password
	if password is config.password.admin
		res.locals.loggedIn = 'admin'
		next()
	else if config.password.users.indexOf(password) isnt -1
		res.locals.loggedIn = 'user'
		next()
	else
		res.redirect 'login'

exports.login = (req, res, next) -> res.render 'login'
exports.dashboard = (req, res, next) ->
	res.render 'dashboard', {passwords: if res.locals.loggedIn is 'admin' then config.password.users else []}

exports.performLogin = (req, res, next) ->
	password = req.body.password
	if password is config.password.admin
		req.session.password = password
		res.locals.loggedIn = 'admin'
		res.redirect '/dashboard'
	else if config.password.users.indexOf(password) isnt -1
		req.session.password = password
		res.locals.loggedIn = 'user'
		res.redirect '/dashboard'
	else
		req.flash('error', 'Neplatné heslo!')
		res.redirect '/login'

exports.logout = (req, res, next) ->
	req.session.destroy();
	res.redirect '/login'

exports.download = (req, res, next) ->
	Activity
		.find({password: req.query.pass}, 'region unit position name week date dayOfWeek planned current action process step')
		.sort({region: 1, unit: 1, name: 1, week: 1, date: 1, action: 1})
		.exec (err, activities)->
			if err
				req.flash 'error', 'Nepodařilo získat data z databáze.'
				res.redirect '/dashboard'
			else
				data = []
				data.push ['region', 'jednotka', 'pozice', 'jméno', 'týden', 'den', 'den v týdnu', 'plán', 'aktuálně', 'akce', 'proces', 'krok v procesu']
				for activity in activities
					data.push [activity.region, activity.unit, activity.position, activity.name, activity.week, activity.date, activity.dayOfWeek, activity.planned, activity.current, activity.action, activity.process, activity.step]

				buffer = xlsx.build [{name: 'Záznamy', data: data}]
				res.attachment('datasheet.xlsx');
				res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
				return res.send buffer

parseName = (name, dot) ->
	nameParts = name.substr(0, dot).split('_').filter (item) -> item.length > 0
	type = nameParts.shift()
	info = {
		position: '',
		name: '',
		region: nameParts.shift(),
		unit: ''
	}
	if type.indexOf('MP') isnt -1
		info.position = 'MP'
		info.name = nameParts.join(' ')
	else if type.indexOf('SP') isnt -1
		info.position = 'SP'
		info.name = nameParts.join(' ')
	else if type.indexOf('UM') isnt -1
		info.position = 'UM'
		info.unit = nameParts.shift()
		info.name = nameParts.join(' ')
	else
		info.position = 'FA'
		info.unit = nameParts.shift()
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

parseDays = (actions, info, week, dates, data) ->
	realData = []
	firstDay = moment(dates[2] + '2016', "D.M.YYYY")
	count = 0
	for cell, key in dates when key > 1 and cell and cell.length is 2
		day = {
			week: week,
			day: firstDay.clone().add(count, 'd').format('YYYY-MM-DD'),
			dayOfWeek: cell
		}
		count++
		for row in data
			itemData = {}
			itemData.region = info.region
			itemData.unit = info.unit
			itemData.position = info.position
			itemData.name = info.name
			itemData.week = day.week
			itemData.date = day.day
			itemData.dayOfWeek = day.dayOfWeek
			itemData.planned = if row.length >= key and row[key] then row[key] else 0
			itemData.current = if row.length > key and key <= 10 and row[key] then row[key+1] else 0
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

parseWeeks = (actions, info, weeks, types, dates, data) ->
	realWeekData = []
	console.log weeks, dates
	for cell, key in weeks when key > 3 and cell
		week = {
			week: cell,
			date: moment(dates[key] + '2016', "D.M.YYYY").format('YYYY-MM-DD'),
		}
		for row in data
			itemData = {}
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

parseSheets = (info, actions, sheets) ->
	data = []
	rows = Object.keys(actions).length
	for sheet in sheets
		weeks = sheet.shift()
		dates = sheet.shift()
		types = sheet.shift()
		usefulRows = []
		for i in [0...rows-1]
			usefulRows.push sheet[i]

		data = data.concat if info.position is 'FA' then parseDays(actions, info, weeks[3], dates, usefulRows) else parseWeeks(actions, info, weeks, dates, types, usefulRows)

	return data

parseData = (info, data) ->
	actions= {}
	sheets = []
	result = []
	for sheet in data
		sheet.name = sheet.name.replace(' POPIS', '')
		if sheet.name is 'Aktivity_'+info.position then actions = parseActions(sheet.data)
		else if sheet.data[0].length > 3 and sheet.data[0][4] != ''
			if info.position is 'FA' and sheet.data[0].length > 6 and sheet.data[0][7] != '' then continue
			else sheets.push sheet.data
	result = parseSheets(info, actions, sheets)
	return result

parseFile = (file, next) ->
	dot = file.originalname.indexOf('.xlsx')
	if dot is -1 then next('Soubor ' + file.originalname + ' není excelový soubor.')
	else
		info = parseName(file.originalname, dot)
		data = parseData(info, xlsx.parse file.path)
		fs.unlinkSync(file.path)
		next(null, data)

saveFiles = (req, data, next) ->
	async.each(
		data
		(file, cb) ->
			async.each(
				file,
				(item, callback) ->
					item.password = req.session.password
					Activity.updateOrCreate item, callback
				cb
			)
		next
	)

exports.upload = (req, res, next) ->
	if !req.files or !req.files.length
		req.flash('error', 'Nebyla přijata data')
		res.redirect('/dashboard')
	else
		async.waterfall(
			[
				(callback) ->
					async.mapSeries(
						req.files
						(file, cb) ->	parseFile(file, cb)
						callback
					)
				(files, callback) -> saveFiles(req, files, callback)
			],
			(err, data) ->
				if err
					req.flash('error', err)
					res.redirect('/dashboard')
				else
					req.flash('success', 'Úspěšně uloženo.')
					res.redirect('/dashboard')
		)