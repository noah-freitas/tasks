(function () {
    'use strict';

    angular.module('tasks', ['ui.bootstrap'])
        .controller('tasksController', function (lastCompleteFilters, Task, taskFrequencies, taskStorage, userStorage, $scope, $timeout) {
            $scope.addTask     = addTask;
            $scope.availFilter = ['Both', 'Not Complete', 'Complete'];
            $scope.currentUser = null;
            $scope.filter      = '';
            $scope.filAvail    = 'Both';
            $scope.filLastCom  = Infinity;
            $scope.frequencies = taskFrequencies;
            $scope.lastComFils = lastCompleteFilters;
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
        .controller('taskCompletionController', function (userStorage, $modalInstance, $scope, task, currentUser) {
            $scope.task = task;
            $scope.canAddUser = true;
            $scope.currentUser = currentUser;
            $scope.userPoints = {};
            $scope.userPoints[$scope.currentUser.email] = $scope.task.score;
            $scope.users = userStorage.get();

            $scope.addUser = function () {
                $scope.userPoints[$scope.currentUser.email] -= $scope.userScore;
                $scope.userPoints[$scope.newUser.email] = $scope.userScore;
                $scope.canAddUser = false;
            };

            $scope.cancel = function () {
                $modalInstance.dismiss('cancel');
            };

            $scope.ok = function () {
                $modalInstance.close(Object.keys($scope.userPoints).map(function (email) {
                    return {
                        score : Number($scope.userPoints[email]),
                        user  : $scope.users.filter(function (u) { return u.email === email; })[0]
                    };
                }));
            };
        })
        .directive('taskDisplay', function (task, $filter, $modal) {
            return {
                link        : linkFn,
                replace     : false,
                restrict    : 'AE',
                scope       : { index: '@', task : '=', user : '=' },
                templateUrl : 'html/task-display.html'
            };

            function linkFn($scope) {
                var dateFilter       = $filter('date', 'short');
                $scope.colorTask     = colorTask;
                $scope.completed     = task.isComplete($scope.task);
                $scope.completeTask  = completeTask;
                $scope.lastCompleted = lastCompleted;
                $scope.nextAvailable = nextAvailable;
                $scope.rowIndex      = Number($scope.index) + 1;

                function colorTask(task) {
                    switch (task.score) {
                        case 800 :
                        case 600 : return 'rgba(6, 191, 85, 1.0)';
                        case 400 : return 'rgba(218, 209, 95, 1.0)';
                        case 300 :
                        case 200 : return 'rgba(244, 135, 70, 1.0)';
                        case 100 : return 'rgba(241, 92, 60, 1.0)';
                    }
                }

                // completeTask :: undefined -> undefined
                function completeTask() {
                    $modal.open({
                        controller  : 'taskCompletionController',
                        resolve     : { task : function () { return $scope.task; }, currentUser: function () { return $scope.user; } },
                        templateUrl : 'html/task-completion.html'
                    }).result.then(function (userPoints) {
                        task.complete($scope.task, userPoints);
                        $scope.completed = task.isComplete($scope.task);
                    });
                }

                // nextAvailable :: Task -> String
                function nextAvailable(task) {
                    var lastCompletion = task.completions[task.completions.length - 1];
                    return lastCompletion ? dateFilter(lastCompletion.time + task.frequency) : 'Now';
                }

                // lastCompleted :: Task -> String
                function lastCompleted(task) {
                    var lastCompletion = task.completions[task.completions.length - 1];
                    return lastCompletion ?
                        dateFilter(lastCompletion.time) + ' by ' + lastCompletion.completedBy[0].user :
                        'Never';
                }
            }
        })
        .factory('task', function (taskStorage) {
            return {
                isComplete : isComplete,
                complete   : complete
            };

            // complete :: Task, [{ score :: Number, user :: User }] -> undefined
            function complete(task, userScores) {
                task.completions.push({
                    completedBy : userScores.map(function (us) { return { score : us.score, user : us.user.email }; }),
                    time        : Date.now()
                });

                taskStorage.save(task);
            }

            // isCompleted :: Task -> Boolean
            function isComplete(task) {
                var lastCompletion = task.completions && task.completions[task.completions.length - 1];

                // Normalize last completion times so that tasks are available at midnight of the
                // day on which they become available.
                if (lastCompletion) {
                    var last = new Date(lastCompletion.time),
                        now  = new Date();

                    // Only normalize if this is a new day.
                    if (last.getDate() !== now.getDate()) {
                        last.setHours(0);
                        last.setMinutes(0);
                        last.setMilliseconds(0);
                        lastCompletion.time = last.getTime();
                    }

                    // Reset weekly tasks on Sunday.
                    if (task.frequency === 604800000 && now.getDay() < last.getDay() && last.getDate() < now.getDate()) {
                        return false;
                    }
                }

                return lastCompletion && task.frequency + lastCompletion.time > Date.now();
            }
        })
        .filter('available', function (task) {
            return function (tasks, complete) {
                return complete === 'Both' ? tasks : tasks.filter(function (t) {
                    return complete === (task.isComplete(t) ? 'Complete' : 'Not Complete');
                });
            };
        })
        .filter('lastComplete', function () {
            return function (tasks, lastComplete) {
                var now = Date.now() - lastComplete;
                return lastComplete === Infinity ? tasks : tasks.filter(function (t) { return t.completions.some(function (c) { return c.time > now; }); });
            };
        })
        .filter('score', function (taskStorage) {
            var today = todayBeginning(),
                sevenDay = today - 604800000;

            return function (user, time) {
                switch (time) {
                    case 'alltime' : return scoreFrom(0, user);
                    case '7days'   : return scoreFrom(sevenDay, user);
                    case 'today'   : return scoreFrom(today, user);
                    default        : throw new Error('Unknown score filter time: ' + time);

                }
            };

            // scoreFrom :: Number, { email :: String } -> Number
            function scoreFrom(beginning, user) {
                // TODO: refactor this.
                return flatten(flatten(taskStorage.get().filter(function (t) {
                    return t.completions.length > 0;
                }).map(function (t) {
                    return t.completions;
                })).filter(function (c) {
                    return c.time > beginning;
                }).map(function (c) {
                    return c.completedBy;
                })).filter(function (item) {
                    return item.user === user.email;
                }).reduce(function (acc, item) {
                    return acc + Number(item.score);
                }, 0);

            }

            function flatten(as) {
                return Array.prototype.concat.apply([], as);
            }

            // todayBeginning :: undefined -> Number
            function todayBeginning() {
                var date = new Date();
                date.setHours(0);
                date.setMinutes(0);
                date.setMilliseconds(0);
                return date.getTime();
            }
        })
        /**
         * Task :: {
         *     approval    :: TaskApproval
         *     completions :: [TaskCompletion]
         *     frequency   :: Number
         *     name        :: String
         *     score       :: Number
         * }
         *
         * TaskCompletion :: {
         *     completedBy :: [{ user :: String, score :: Number }]
         *     time        :: Number
         * }
         *
         * TaskApproval :: {
         *     approved :: Boolean
         *     by       :: [User]
         *     on       :: Date || null
         * }
         */
        .value('Task', function Task(task) {
            task.completions = task.completions || [];
            task.frequency   = task.frequency   || 604800000; // Default is one week.
            if (typeof task.name  === 'undefined') throw new TypeError('A task must have a name.');
            if (typeof task.score === 'undefined') throw new TypeError('A task must have a score.');

            return task;
        })
        .value('lastCompleteFilters', [{
            label : 'Whenever',
            value : Infinity
        }, {
            label : '24 Hours',
            value : 86400000
        }, {
            label : '7 Days',
            value : 604800000
        }, {
            label : '30 Days',
            value : 2419200000
        }])
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
        }, {
            label : 'Quarterly',
            value : 7257600000
        }])
        .filter('nextTask', function () {
            return function (tasks) {
                return tasks.slice(0).sort(function (t1, t2) {
                    var t1next = t1.completions.length > 0 ? t1.completions[t1.completions.length - 1].time + t1.frequency : 0,
                        t2next = t2.completions.length > 0 ? t2.completions[t2.completions.length - 1].time + t2.frequency : 0;

                    return t1next === t2next ? t2.score - t1.score : t1next - t2next;
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
