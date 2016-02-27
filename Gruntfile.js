module.exports = function(grunt) {

	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		coffee: {
			controllers: {
				options: {
					bare: true
				},
				expand: true,
				flatten: false,
				cwd: '',
				src: ['controllers/*.coffee'],
				dest: '',
				ext: '.js',
				extDot: 'last'
			},
			angular: {
				options: {
					bare: true
				},
				expand: true,
				flatten: false,
				cwd: '',
				src: ['public/javascripts/angular/*.coffee'],
				dest: '',
				ext: '.js',
				extDot: 'last'
			}
		},
		concat: {
			options: {
				separator: ';'
			},
			dist: {
				src: ['public/<%= pkg.jsDir %>/src/**/*.js'],
				dest: 'public/<%= pkg.jsDir %>/<%= pkg.jsName %>.js'
			}
		},
		uglify: {
			options: {
				banner: '/*! <%= pkg.name %> <%= grunt.template.today("dd-mm-yyyy") %> */\n'
			},
			dist: {
				files: {
					'public/<%= pkg.jsDir %>/<%= pkg.jsName %>.min.js': ['<%= concat.dist.dest %>']
				}
			}
		},
		less: {
			development: {
				files: {
					"public/<%= pkg.cssDir %>/<%= pkg.cssName %>.css": "public/<%= pkg.cssDir %>/src/<%= pkg.cssName %>.less"
				}
			},
			production: {
				options: {
					cleancss: true
				},
				files: {
					"public/<%= pkg.cssDir %>/<%= pkg.cssName %>.min.css": "public/<%= pkg.cssDir %>/src/<%= pkg.cssName %>.less"
				}
			}
		},
		watch: {
			controllers: {
				files: ['controllers/*.coffee'],
				tasks: ['coffee']
			},
			angular: {
				files: ['public/javascripts/angular/*.coffee'],
				tasks: ['coffee:angular']
			},
			js: {
				files: ['public/javascripts/src/*.js'],
				tasks: ['concat', 'uglify']
			},
			css: {
				files: ["public/<%= pkg.cssDir %>/src/**/*.less"],
				tasks: ['less']
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-contrib-less');
	grunt.loadNpmTasks('grunt-contrib-watch');
	grunt.loadNpmTasks('grunt-contrib-concat');
	grunt.loadNpmTasks('grunt-contrib-coffee');

	grunt.registerTask('test', ['jshint', 'less']);
	grunt.registerTask('default', ['coffee', 'concat', 'uglify', 'less']);

};