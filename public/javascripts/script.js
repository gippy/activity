var app = angular.module('ActivityApp', ['mgcrea.ngStrap']);

app.config(function($selectProvider) {
	angular.extend($selectProvider.defaults, {
		animation: 'am-flip-x'
	});
});

app.config(function($tooltipProvider) {
	angular.extend($tooltipProvider.defaults, {
		animation: 'am-flip-x',
		trigger: 'hover focus click'
	});
});

app.config(function($datepickerProvider) {
	angular.extend($datepickerProvider.defaults, {
		animation: 'am-flip-x',
		dateFormat: 'yyyy-MM-dd',
		startWeek: 1,
		modelDateFormat: 'yyyy-MM-dd',
		dateType: 'string'
	});
});

app.controller('BaseController', function($scope){
	$scope.maxViewValue = 0
});

app.controller('ViewController', function($scope, $http){
	$scope.conditions = {
		position: '',
		from: '',
		to: '',
		region: '',
		unit: ''
	};
	$scope.options = {};
	$scope.users = [];
	$scope.actions = {};
	$scope.activities = [];

	$scope.getWidth = function(count){
		return Math.round(count * 100 / $scope.$parent.maxViewValue) + '%';
	};

	$scope.getFilters = function() {
		var queries = [];
		return queries.join(' - ')
	};

	var getQuery = function(){
		var queries = [];
		if ($scope.conditions.position) queries.push('position='+$scope.conditions.position);
		if ($scope.conditions.region) queries.push('region='+$scope.conditions.region.region);
		if ($scope.conditions.unit) queries.push('unit='+$scope.conditions.unit);
		if ($scope.conditions.from) queries.push('from='+$scope.conditions.from);
		if ($scope.conditions.to) queries.push('to='+$scope.conditions.to);
		return '&' + queries.join('&')
	};

	$scope.getPeriods = function(){
		return $scope.options.periods.filter(function(item){
			if (item.position){
				if ($scope.conditions.position) return false;
				else if (item.position != $scope.conditions.position) return false;
			}
			return true;
		});
	};

	$scope.getData = function () {
		$http.get('/report-data'+window.location.search + getQuery()).success(function(response){
			$scope.options = response.options;
			response.options.positions.splice(0,0, {position: null, label: "Vše"});
			response.options.regions.splice(0,0, {region: null, label: "Vše"});

			if (!$scope.conditions.from) $scope.conditions.from = response.defaultFrom;
			if (!$scope.conditions.to) $scope.conditions.to = response.defaultTo;

			$scope.users = response.data.users.splice(0,10);
			$scope.actions = response.data.actions;
			var i, action,  max;
			for (i in $scope.actions){
				if (!$scope.actions.hasOwnProperty(i)) continue;
				action = $scope.actions[i];
				if (action.max.value > $scope.$parent.maxViewValue) $scope.$parent.maxViewValue = action.max.value;
				max = $scope.$parent.maxViewValue;
			}
			$scope.activities = response.data.actions.map(function(item){
				return {
					label: item.label,
					users: item.users
				}
			});
			$scope.activities.splice(0,0,{label: 'Vše'});
			$scope.showFilters = false
		});
	};
	$scope.getData();

	$scope.round = function(num) { return Math.round(num); };

	$scope.getTopTen = function(){
		if ($scope.conditions.activity && $scope.conditions.activity.hasOwnProperty('users')) return $scope.conditions.activity.users;
		else return $scope.users;
	};

});