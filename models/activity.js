var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var activitySchema = Schema({
	password: String,
	region: String,
	unit: String,
	position: String,
	name: String,
	week: Number,
	date: String,
	dayOfWeek: String,
	planned: Number,
	current: Number,
	action: String,
	process: String,
	step: String
});

activitySchema.statics = {
	updateOrCreate: function(activity, next){
		var Activity = this;
		Activity.findOne({
			password: activity.password,
			region: activity.region,
			unit: activity.unit,
			name: activity.name,
			date: activity.date,
			action: activity.action
		}, function(err, oldActivity){
			if (err) next(err);
			else if (oldActivity){
				oldActivity.planned = activity.planned;
				oldActivity.current = activity.current;
				oldActivity.save(function(err){
					if (err) next(err);
					else next(null, oldActivity);
				});
			} else {
				Activity.create(activity, next);
			}
		});
	}
};

mongoose.model('Activity', activitySchema);