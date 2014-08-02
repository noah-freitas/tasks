(function () {
    'use strict';

    angular.module('tasks', ['ui.bootstrap'])
        .controller('tasksController', function (Task, taskFrequencies, taskStorage, userStorage, $scope, $timeout) {
            $scope.addTask     = addTask;
            $scope.currentUser = null;
            $scope.frequencies = taskFrequencies;
            $scope.newTask     = { frequency : null, name : null, score : null };
            $scope.tasks       = taskStorage.get();
            $scope.users       = userStorage.get();

            $timeout(pollData, 1000);

            function addTask(task) {
                var newTask = Task({ frequency : task.frequency, name : task.name, score : task.score });
                $scope.tasks.push(newTask);
                taskStorage.save(newTask);
                $scope.newTask = { frequency : null, name : null, score : null };
            }

            function pollData() {
                $scope.tasks = taskStorage.get();
                $scope.users = userStorage.get();
                $timeout(pollData, 1000);
            }
        })
        .directive('taskDisplay', function (task, $filter) {
            return {
                link        : linkFn,
                replace     : false,
                restrict    : 'AE',
                scope       : { task : '=', user : '=' },
                templateUrl : 'html/task-display.html'
            };

            function linkFn($scope) {
                var dateFilter       = $filter('date', 'short');
                $scope.completed     = isCompleted($scope.task);
                $scope.completeTask  = completeTask;
                $scope.lastCompleted = lastCompleted;
                $scope.nextAvailable = nextAvailable;

                function completeTask() {
                    task.complete($scope.task, $scope.user);
                    $scope.completed = isCompleted($scope.task);
                }

                function isCompleted(task) {
                    var lastCompletion = task.completions && task.completions[task.completions.length - 1];
                    return lastCompletion && $scope.task.frequency + lastCompletion.time > Date.now();
                }

                function nextAvailable(task) {
                    var lastCompletion = task.completions[task.completions.length - 1];
                    return lastCompletion ? dateFilter(lastCompletion.time + task.frequency) : 'Now';
                }

                function lastCompleted(task) {
                    var lastCompletion = task.completions[task.completions.length - 1];
                    return lastCompletion ?
                        dateFilter(lastCompletion.time) + ' by ' + lastCompletion.completedBy.email :
                        'Never';
                }
            }
        })
        .factory('task', function (taskStorage, userStorage) {
            return {
                complete : complete
            }

            // complete :: Task, User -> undefined
            function complete(task, user) {
                user.score += task.score;
                task.completions.push({
                    completedBy : user,
                    time        : Date.now()
                });
                taskStorage.save(task);
                userStorage.save(user);
            }
        })
        /**
         * Task :: {
         *     completions :: [TaskCompletion]
         *     frequency   :: Number
         *     name        :: String
         *     score       :: Number
         * }
         *
         * TaskCompletion :: {
         *     completedBy :: String
         *     time        :: Number
         * }
         */
        .value('Task', function Task(task) {
            task.completions = task.completions || [];
            task.frequency   = task.frequency   || 604800000; // Default is one week.
            if (typeof task.name  === 'undefined') throw new TypeError('A task must have a name.');
            if (typeof task.score === 'undefined') throw new TypeError('A task must have a score.');

            return task;
        })
        .value('taskFrequencies', [{
            label : 'Daily',
            value : 86400000
        },{
            label : 'Weekly',
            value : 604800000
        }, {
            label : 'Bi-Weekly (Every Two Weeks)',
            value : 1209600000
        }, {
            label : 'Monthly',
            value : 2419200000
        }])
        .filter('nextTask', function () {
            return function (tasks) {
                return tasks.slice(0).sort(function (t1, t2) {
                    var t1next = t1.completions.length > 0 ? t1.completions[t1.completions.length - 1].time + t1.frequency : 0,
                        t2next = t2.completions.length > 0 ? t2.completions[t2.completions.length - 1].time + t2.frequency : 0;

                    return t1next === t2next ? t1.score - t2.score : t1next - t2next;
                });
            }
        })
        .factory('taskStorage', function (Task) {
            return {
                get  : get,
                save : save
            };

            function get() {
                return JSON.parse(localStorage.tasks || '[]').map(Task);
            }

            function save(task) {
                var tasks = get(),
                    index = null;

                tasks.some(function (t, i) {
                    var isTask = t.name === task.name;
                    if (isTask) index = i;
                    return isTask;
                });

                tasks[index !== null ? index : tasks.length] = task;
                set(tasks);
            }

            function set(tasks) {
                localStorage.tasks = JSON.stringify(tasks.map(function (t) {
                    return Task({
                        completions : t.completions.map(function (c) { return { completedBy : c.completedBy, time : c.time }; }),
                        frequency   : t.frequency,
                        name        : t.name,
                        score       : t.score
                    });
                }));
            }
        })
        .factory('userStorage', function (User) {
            return {
                get  : get,
                save : save
            };

            function get() {
                return JSON.parse(localStorage.users || '[{ "email" : "Noah", "score" : 0 }, { "email" : "Imelda", "score" : 0 }]').map(User);
            }

            function save(user) {
                var users = get();
                users.filter(function (u) { return u.email === user.email; })[0].score = user.score;
                localStorage.users = JSON.stringify(users);
            }
        })
        /**
         * User :: {
         *     email :: String
         *     score :: Number
         * }
         */
        .value('User', function User(user) {
            if (typeof user.email === 'undefined') throw new TypeError('A user must have an email.');
            user.score = user.score || 0;

            return user;
        });
}());
