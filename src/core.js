/**
 * Init the builder
 */
QueryBuilder.prototype.init = function($el, options) {
    $el[0].queryBuilder = this;
    this.$el = $el;

    // PROPERTIES
    this.settings = $.extendext(true, 'replace', {}, QueryBuilder.DEFAULTS, options);
    this.model = new Model();
    this.status = {
        group_id: 0,
        rule_id: 0,
        generated_id: false,
        has_optgroup: false,
        id: null,
        updating_value: false
    };

    // "allow_groups" can be boolean or int
    if (this.settings.allow_groups === false) {
        this.settings.allow_groups = 0;
    }
    else if (this.settings.allow_groups === true) {
        this.settings.allow_groups = -1;
    }

    // SETTINGS SHORTCUTS
    this.filters = this.settings.filters;
    this.icons = this.settings.icons;
    this.operators = this.settings.operators;
    this.template = this.settings.template;
    this.plugins = this.settings.plugins;
    
    // translations : english << 'lang_code' << custom
    if (QueryBuilder.regional['en'] === undefined) {
        error('"i18n/en.js" not loaded.');
    }
    this.lang = $.extendext(true, 'replace', {}, QueryBuilder.regional['en'], QueryBuilder.regional[this.settings.lang_code], this.settings.lang);

    if (this.template.group === null) {
        this.template.group = this.getGroupTemplate;
    }
    if (this.template.rule === null) {
        this.template.rule = this.getRuleTemplate;
    }

    // ensure we have a container id
    if (!this.$el.attr('id')) {
        this.$el.attr('id', 'qb_'+Math.floor(Math.random()*99999));
        this.status.generated_id = true;
    }
    this.status.id = this.$el.attr('id');

    // INIT
    this.$el.addClass('query-builder form-inline');

    this.filters = this.checkFilters(this.filters);
    this.bindEvents();
    this.initPlugins();

    this.trigger('afterInit');

    if (options.rules) {
        this.setRules(options.rules);
        delete this.settings.rules;
    }
    else {
        this.setRoot(true);
    }
};

/**
 * Checks the configuration of each filter
 */
QueryBuilder.prototype.checkFilters = function(filters) {
    var definedFilters = [],
        that = this;

    if (!filters || filters.length === 0) {
        error('Missing filters list');
    }

    filters.forEach(function(filter, i) {
        if (!filter.id) {
            error('Missing filter {0} id', i);
        }
        if (definedFilters.indexOf(filter.id) != -1) {
            error('Filter "{0}" already defined', filter.id);
        }
        definedFilters.push(filter.id);

        if (!filter.type) {
            filter.type = 'string';
        }
        else if (!QueryBuilder.types[filter.type]) {
            error('Invalid type "{0}"', filter.type);
        }

        if (!filter.input) {
            filter.input = 'text';
        }
        else if (typeof filter.input != 'function' && QueryBuilder.inputs.indexOf(filter.input) == -1) {
            error('Invalid input "{0}"', filter.input);
        }

        if (!filter.field) {
            filter.field = filter.id;
        }
        if (!filter.label) {
            filter.label = filter.field;
        }

        if (!filter.optgroup) {
            filter.optgroup = null;
        }
        else {
            that.status.has_optgroup = true;
        }

        switch (filter.input) {
            case 'radio': case 'checkbox':
                if (!filter.values || filter.values.length < 1) {
                    error('Missing filter "{0}" values', filter.id);
                }
                break;

            case 'select':
                if (filter.placeholder) {
                    if (filter.placeholder_value === undefined) {
                        filter.placeholder_value = -1;
                    }
                    iterateOptions(filter.values, function(key, val) {
                        if (key == filter.placeholder_value) {
                            error('Placeholder of filter "{0}" overlaps with one of its values', filter.id);
                        }
                    });
                }
                break;
        }
    });

    // group filters with same optgroup, preserving declaration order when possible
    if (this.status.has_optgroup) {
        var optgroups = [],
            newFilters = [];

        filters.forEach(function(filter, i) {
            var idx;

            if (filter.optgroup) {
                idx = optgroups.lastIndexOf(filter.optgroup);

                if (idx == -1) {
                    idx = optgroups.length;
                }
                else {
                    idx++;
                }
            }
            else {
                idx = optgroups.length;
            }

            optgroups.splice(idx, 0, filter.optgroup);
            newFilters.splice(idx, 0, filter);
        });

        filters = newFilters;
    }

    return filters;
};

/**
 * Add all events listeners
 */
QueryBuilder.prototype.bindEvents = function() {
    var that = this;

    // group condition change
    this.$el.on('change.queryBuilder', '.rules-group-header [name$=_cond]', function() {
        if ($(this).is(':checked')) {
            var $group = $(this).closest('.rules-group-container');
            Model($group).condition = $(this).val();
        }
    });

    // rule filter change
    this.$el.on('change.queryBuilder', '.rule-filter-container [name$=_filter]', function() {
        var $rule = $(this).closest('.rule-container');
        Model($rule).filter = that.getFilterById($(this).val());
    });

    // rule operator change
    this.$el.on('change.queryBuilder', '.rule-operator-container [name$=_operator]', function() {
        var $rule = $(this).closest('.rule-container');
        Model($rule).operator = that.getOperatorByType($(this).val());
    });

    // add rule button
    this.$el.on('click.queryBuilder', '[data-add=rule]', function() {
        var $group = $(this).closest('.rules-group-container');
        that.addRule(Model($group));
    });

    // delete rule button
    this.$el.on('click.queryBuilder', '[data-delete=rule]', function() {
        var $rule = $(this).closest('.rule-container');
        that.deleteRule(Model($rule));
    });

    if (this.settings.allow_groups !== 0) {
        // add group button
        this.$el.on('click.queryBuilder', '[data-add=group]', function() {
            var $group = $(this).closest('.rules-group-container');
            that.addGroup(Model($group));
        });

        // delete group button
        this.$el.on('click.queryBuilder', '[data-delete=group]', function() {
            var $group = $(this).closest('.rules-group-container');
            that.deleteGroup(Model($group));
        });
    }

    // model events
    this.model.on({
        'drop': function(e, node) {
            node.$el.remove();
        },
        'add': function(e, node, index) {
            node.$el.detach();

            if (index === 0) {
                node.$el.prependTo(node.parent.$el.find('>.rules-group-body>.rules-list'));
            }
            else {
                node.$el.insertAfter(node.parent.rules[index-1].$el);
            }
        },
        'update': function(e, node, field, value, oldValue) {
            switch (field) {
                case 'error':
                    that.displayError(node);
                    break;

                case 'condition':
                    that.updateGroupCondition(node);
                    break;

                case 'filter':
                    that.updateRuleFilter(node);
                    break;

                case 'operator':
                    that.updateRuleOperator(node, oldValue);
                    break;

                case 'flags':
                    that.applyRuleFlags(node);
                    break;

                case 'value':
                    that.updateRuleValue(node);
                    break;
            }
        }
    });
};

/**
 * Create the root group
 * @param addRule {bool,optional} add a default empty rule
 * @param data {mixed,optional} group custom data
 * @return group {Root}
 */
QueryBuilder.prototype.setRoot = function(addRule, data) {
    addRule = (addRule === undefined || addRule === true);

    var group_id = this.nextGroupId(),
        $group = $(this.template.group.call(this, group_id, 1));

    this.$el.append($group);
    this.model.root = new Group(null, $group);
    this.model.root.model = this.model;
    this.model.root.condition = this.settings.default_condition;

    if (data !== undefined) {
        this.model.root.data = data;
    }

    if (addRule) {
        this.addRule(this.model.root);
    }

    return this.model.root;
};

/**
 * Add a new group
 * @param parent {Group}
 * @param addRule {bool,optional} add a default empty rule
 * @param data {mixed,optional} group custom data
 * @return group {Group}
 */
QueryBuilder.prototype.addGroup = function(parent, addRule, data) {
    addRule = (addRule === undefined || addRule === true);

    var level = parent.level + 1;

    var e = this.trigger('beforeAddGroup', parent, addRule, level);
    if (e.isDefaultPrevented()) {
        return null;
    }

    var group_id = this.nextGroupId(),
        $group = $(this.template.group.call(this, group_id, level)),
        model = parent.addGroup($group);

    if (data !== undefined) {
        model.data = data;
    }

    this.trigger('afterAddGroup', model);

    model.condition = this.settings.default_condition;

    if (addRule) {
        this.addRule(model);
    }

    return model;
};

/**
 * Tries to delete a group. The group is not deleted if at least one rule is no_delete.
 * @param group {Group}
 * @return {boolean} true if the group has been deleted
 */
QueryBuilder.prototype.deleteGroup = function(group) {
    if (group.isRoot()) {
        return false;
    }

    var e = this.trigger('beforeDeleteGroup', group);
    if (e.isDefaultPrevented()) {
        return false;
    }

    var del = true;

    group.each('reverse', function(rule) {
        del&= this.deleteRule(rule);
    }, function(group) {
        del&= this.deleteGroup(group);
    }, this);

    if (del) {
        group.drop();
        this.trigger('afterDeleteGroup');
    }

    return del;
};

/**
 * Changes the condition of a group
 * @param group {Group}
 */
QueryBuilder.prototype.updateGroupCondition = function(group) {
    group.$el.find('>.rules-group-header [name$=_cond]').each(function() {
        var $this = $(this);
        $this.prop('checked', $this.val() === group.condition);
        $this.parent().toggleClass('active', $this.val() === group.condition);
    });

    this.trigger('afterUpdateGroupCondition', group);
};

/**
 * Add a new rule
 * @param parent {Group}
 * @param data {mixed,optional} rule custom data
 * @return rule {Rule}
 */
QueryBuilder.prototype.addRule = function(parent, data) {
    var e = this.trigger('beforeAddRule', parent);
    if (e.isDefaultPrevented()) {
        return null;
    }

    var rule_id = this.nextRuleId(),
        $rule = $(this.template.rule.call(this, rule_id)),
        model = parent.addRule($rule);

    if (data !== undefined) {
        model.data = data;
    }

    this.trigger('afterAddRule', model);

    this.createRuleFilters(model);

    return model;
};

/**
 * Delete a rule.
 * @param rule {Rule}
 * @return {boolean} true if the rule has been deleted
 */
QueryBuilder.prototype.deleteRule = function(rule) {
    if (rule.flags.no_delete) {
        return false;
    }

    var e = this.trigger('beforeDeleteRule', rule);
    if (e.isDefaultPrevented()) {
        return false;
    }

    rule.drop();

    this.trigger('afterDeleteRule');

    return true;
};

/**
 * Create the filters <select> for a rule
 * @param rule {Rule}
 */
QueryBuilder.prototype.createRuleFilters = function(rule) {
    var filters = this.change('getRuleFilters', this.filters, rule);

    var $filterSelect = $(this.getRuleFilterSelect(rule, filters));

    rule.$el.find('.rule-filter-container').html($filterSelect);

    this.trigger('afterCreateRuleFilters', rule);
};

/**
 * Create the operators <select> for a rule and init the rule operator
 * @param rule {Rule}
 */
QueryBuilder.prototype.createRuleOperators = function(rule) {
    var $operatorContainer = rule.$el.find('.rule-operator-container').empty();

    if (!rule.filter) {
        return;
    }

    var operators = this.getOperators(rule.filter),
        $operatorSelect = $(this.getRuleOperatorSelect(rule, operators));

    $operatorContainer.html($operatorSelect);

    // set the operator without triggering update event
    rule.__.operator = operators[0];

    this.trigger('afterCreateRuleOperators', rule, operators);
};

/**
 * Create the main input for a rule
 * @param rule {Rule}
 */
QueryBuilder.prototype.createRuleInput = function(rule) {
    var $valueContainer = rule.$el.find('.rule-value-container').empty();

    rule.__.value = undefined;

    if (!rule.filter || !rule.operator || rule.operator.nb_inputs === 0) {
        return;
    }

    var that = this,
        $inputs = $(),
        filter = rule.filter;

    for (var i=0; i<rule.operator.nb_inputs; i++) {
        var $ruleInput = $(this.getRuleInput(rule, i));
        if (i > 0) $valueContainer.append(this.settings.inputs_separator);
        $valueContainer.append($ruleInput);
        $inputs = $inputs.add($ruleInput);
    }

    $valueContainer.show();

    $inputs.on('change', function() {
        that.status.updating_value = true;
        rule.value = that.getRuleValue(rule);
        that.status.updating_value = false;
    });

    if (filter.plugin) {
        $inputs[filter.plugin](filter.plugin_config || {});
    }

    this.trigger('afterCreateRuleInput', rule);

    if (filter.default_value !== undefined) {
        rule.value = filter.default_value;
    }
    else {
        that.status.updating_value = true;
        rule.value = that.getRuleValue(rule);
        that.status.updating_value = false;
    }
};

/**
 * Perform action when rule's filter is changed
 * @param rule {Rule}
 */
QueryBuilder.prototype.updateRuleFilter = function(rule) {
    this.createRuleOperators(rule);
    this.createRuleInput(rule);

    rule.$el.find('.rule-filter-container [name$=_filter]').val(rule.filter ? rule.filter.id : '-1');

    this.trigger('afterUpdateRuleFilter', rule);
};

/**
 * Update main <input> visibility when rule operator changes
 * @param rule {Rule}
 * @param previousOperator {object}
 */
QueryBuilder.prototype.updateRuleOperator = function(rule, previousOperator) {
    var $valueContainer = rule.$el.find('.rule-value-container');

    if (!rule.operator || rule.operator.nb_inputs === 0) {
        $valueContainer.hide();

        rule.__.value = undefined;
    }
    else {
        $valueContainer.show();

        if ($valueContainer.is(':empty') || rule.operator.nb_inputs !== previousOperator.nb_inputs) {
            this.createRuleInput(rule);
        }
    }

    if (rule.operator) {
        rule.$el.find('.rule-operator-container [name$=_operator]').val(rule.operator.type);
    }

    this.trigger('afterUpdateRuleOperator', rule);
};

/**
 * Perform action when rule's value is changed
 * @param rule {Rule}
 */
QueryBuilder.prototype.updateRuleValue = function(rule) {
    if (!this.status.updating_value) {
        this.setRuleValue(rule, rule.value);
    }

    this.trigger('afterUpdateRuleValue', rule);
};

/**
 * Change rules properties depending on flags.
 * @param rule {Rule}
 * @param readonly {boolean}
 */
QueryBuilder.prototype.applyRuleFlags = function(rule, readonly) {
    var flags = rule.flags;

    if (flags.filter_readonly) {
        rule.$el.find('.rule-filter-container [name$=_filter]').prop('disabled', true);
    }
    if (flags.operator_readonly) {
        rule.$el.find('.rule-operator-container [name$=_operator]').prop('disabled', true);
    }
    if (flags.value_readonly) {
        rule.$el.find('.rule-value-container [name*=_value_]').prop('disabled', true);
    }
    if (flags.no_delete) {
        rule.$el.find('[data-delete=rule]').remove();
    }

    this.trigger('afterApplyRuleFlags', rule);
};

/**
 * Clear all errors markers
 * @param node {Node,optional} default is root Group
 */
QueryBuilder.prototype.clearErrors = function(node) {
    node = node || this.model.root;

    if (!node) {
        return;
    }

    node.error = null;

    if (node instanceof Group) {
        node.each(function(rule) {
            rule.error = null;
        }, function(group) {
            this.clearErrors(group);
        }, this);
    }
};

/**
 * Add/Remove class .has-error and update error title
 * @param node {Node}
 */
QueryBuilder.prototype.displayError = function(node) {
    if (this.settings.display_errors) {
        if (node.error === null) {
            node.$el.removeClass('has-error');
        }
        else {
            // translate the text without modifying event array
            var error = $.extend([], node.error, [
                this.lang.errors[node.error[0]] || node.error[0]
            ]);

            node.$el.addClass('has-error')
              .find('.error-container').eq(0).attr('title', fmt.apply(null, error));
        }
    }
};

/**
 * Trigger a validation error event
 * @param node {Node}
 * @param error {array}
 * @param value {mixed}
 */
QueryBuilder.prototype.triggerValidationError = function(node, error, value) {
    if (!$.isArray(error)) {
        error = [error];
    }

    var e = this.trigger('validationError', node, error, value);
    if (!e.isDefaultPrevented()) {
        node.error = error;
    }
};