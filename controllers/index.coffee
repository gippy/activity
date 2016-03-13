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
	else if password is config.password.report
		res.locals.loggedIn = 'report'
		next()
	else if config.password.users.indexOf(password) isnt -1
		res.locals.loggedIn = 'user'
		next()
	else
		res.redirect 'login'

exports.login = (req, res, next) -> res.render 'login'
exports.dashboard = (req, res, next) ->
	res.render 'dashboard', {passwords: if res.locals.loggedIn is 'admin' or res.locals.loggedIn is 'report' then config.password.users else []}

exports.performLogin = (req, res, next) ->
	password = req.body.password
	if password is config.password.admin
		req.session.password = password
		res.locals.loggedIn = 'admin'
		res.redirect '/dashboard'
	else if password is config.password.report
		req.session.password = password
		res.locals.loggedIn = 'report'
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
	if res.locals.loggedIn != 'admin' then res.redirect '/dashboard'
	else
		Activity
			.find({password: req.query.pass}, 'region unit position name week date dayOfWeek planned current action')
			.sort({region: 1, unit: 1, name: 1, week: 1, date: 1, action: 1})
			.exec (err, activities)->
				if err
					req.flash 'error', 'Nepodařilo získat data z databáze.'
					res.redirect '/dashboard'
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

parseDays = (actions, info, week, dates, data) ->
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
		for row, i in data
			itemData = {}
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

parseWeeks = (actions, info, weeks, types, dates, data) ->
	realWeekData = []
	for cell, key in weeks when key > 3 and cell
		week = {
			week: cell,
			date: moment(dates[key] + '2016', "D.M.YYYY").format('YYYY-MM-DD'),
		}
		for row, i in data
			itemData = {}
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
	for sheet in data when sheet.data and sheet.data.length > 0
		sheet.name = sheet.name.replace(' POPIS', '')
		if sheet.name is 'Aktivity_'+info.position then actions = parseActions(sheet.data)
		else if sheet.data[0].length > 3 and sheet.data[0][4] != ''
			if info.position is 'FA' and sheet.data[0].length > 6 and sheet.data[0][7] != '' then continue
			else sheets.push sheet.data

	result = parseSheets(info, actions, sheets)
	return result

parseFile = (file, next) ->
	dot = file.originalname.indexOf('.xlsx')
	if dot is -1 then dot = file.originalname.indexOf('.xls')

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

getPeriod = (text, position) ->
	if !text then text = 'today'
	if text is 'today' and position isnt 'FA' then text = 'last-week'
	now = moment()
	period = {
		from: null,
		to: null
	}
	switch text
		when "today"
			period.from = now.clone().startOf('day').format('YYYY-MM-DD')
			period.to = now.clone().endOf('day').format('YYYY-MM-DD')
		when "week"
			period.from = now.clone().startOf('isoWeek').format('YYYY-MM-DD')
			period.to = now.clone().endOf('isoWeek').format('YYYY-MM-DD')
		when "last-week"
			period.from = now.clone().startOf('isoWeek').subtract(7, 'd').format('YYYY-MM-DD')
			period.to = now.clone().endOf('isoWeek').subtract(7, 'd').format('YYYY-MM-DD')
		when "month"
			period.from = now.clone().startOf('month').format('YYYY-MM-DD')
			period.to = now.clone().endOf('month').format('YYYY-MM-DD')
		else
			period.from = now.clone().startOf('month').subtract(1, 'M').format('YYYY-MM-DD')
			period.to = now.clone().endOf('month').subtract(1, 'M').format('YYYY-MM-DD')
	return period

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
							if !actions.hasOwnProperty(action) then actions[action] = {current: 0, planned: 0, max: {value: 0, user: null}, count: 0, users: {}}
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
								current: Math.round(data.current/data.count)
								planned: Math.round(data.planned/data.count)
								max: data.max,
								users: realActionUsers.splice(0,10)
							}

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
	if res.locals.loggedIn != 'report' then res.redirect '/dashboard'
	else res.render 'reports'