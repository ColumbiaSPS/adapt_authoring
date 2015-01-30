define(function(require){

  var Backbone = require('backbone');
  var Handlebars = require('handlebars');
  var Origin = require('coreJS/app/origin');
  var EditorOriginView = require('editorGlobal/views/editorOriginView');
  var EditorComponentModel = require('editorPage/models/editorComponentModel');
  var EditorComponentView = require('editorPage/views/editorComponentView');
  var EditorComponentPasteZoneView = require('editorPage/views/editorComponentPasteZoneView');

  var EditorBlockView = EditorOriginView.extend({

    tagName: 'div',

    className: 'block editable block-draggable',

    settings: {
      autoRender: false
    },

    events: _.extend({
      'click a.block-delete'        : 'deleteBlockPrompt',
      'click a.add-component'       : 'showComponentList',
      'click a.open-context-block'  : 'openContextMenu',
      'dblclick'                    : 'loadBlockEdit'
    }, EditorOriginView.prototype.events),

    preRender: function() {
      this.listenTo(Origin, 'editorView:removeSubViews', this.remove);
      this.listenTo(Origin, 'editorPageView:removePageSubViews', this.remove);
      this.listenTo(this.model, 'sync', this.setupModelEvents);
      if (!this.model.isNew()) {
        this.setupModelEvents();
      }

      this.listenTo(this, {
        'contextMenu:block:edit': this.loadBlockEdit,
        'contextMenu:block:copy': this.onCopy,
        'contextMenu:block:cut': this.onCut,
        'contextMenu:block:delete': this.deleteBlockPrompt
      });

      this.model.set('componentTypes', Origin.editor.data.componentTypes.toJSON());

      this.evaluateComponents(this.render);
    },

    setupModelEvents: function() {
      this.listenTo(Origin, 'editorView:removeComponent:' + this.model.get('_id'), this.handleRemovedComponent);
      this.listenTo(Origin, 'editorView:moveComponent:' + this.model.get('_id'), this.reRender);
      this.listenTo(Origin, 'editorView:cutComponent:' + this.model.get('_id'), this.onCutComponent);
      this.listenTo(Origin, 'editorView:addComponent:' + this.model.get('_id'), this.addComponent);
      this.listenTo(Origin, 'editorView:deleteBlock:' + this.model.get('_id'), this.deleteBlock);
    },

    postRender: function() {
      this.addComponentViews();
      this.setupDragDrop();

      _.defer(_.bind(function(){
        this.trigger('blockView:postRender');
        Origin.trigger('pageView:itemRendered');
      }, this));
    },

    evaluateComponents: function(callback) {
      var layoutOptions = [
      {
        type: 'left',
        name: 'app.layoutleft',
        pasteZoneRenderOrder: 2
      },
      {
        type: 'full',
        name: 'app.layoutfull',
        pasteZoneRenderOrder: 1
      },
      {
        type: 'right',
        name: 'app.layoutright',
        pasteZoneRenderOrder: 3
      }];

      this.model.getChildren().each(function(component) {
        this.$('.page-components').append(new EditorComponentView({model: component}).$el);

        switch (component.get('_layout')) {
          case 'full':
            layoutOptions = null;
            break;
          case 'left':
            layoutOptions.splice(_.indexOf(layoutOptions, _.findWhere(layoutOptions, { type : "full"})), 1);
            layoutOptions.splice(_.indexOf(layoutOptions, _.findWhere(layoutOptions, { type : "left"})), 1);
            break;
          case 'right':
            layoutOptions.splice(_.indexOf(layoutOptions, _.findWhere(layoutOptions, { type : "full"})), 1);
            layoutOptions.splice(_.indexOf(layoutOptions, _.findWhere(layoutOptions, { type : "right"})), 1);
            break;
        }
      }, this);

      var dragLayoutOptions = [];
      var components = this.model.getChildren();
      if (components.length === 1) {
        switch (components.at(0).get('_layout')) {
          case 'full':
            dragLayoutOptions.push({type: 'left', name: 'app.layoutleft'});
            dragLayoutOptions.push({type: 'right', name: 'app.layoutright'});
            break;
          case 'left':
            dragLayoutOptions.push({type: 'full', name: 'app.layoutfull'});
            break;
          case 'right':
            dragLayoutOptions.push({type: 'full', name: 'app.layoutfull'});
            break;
        }
      }

      this.model.set({"layoutOptions": layoutOptions, "dragLayoutOptions": dragLayoutOptions});

      if (callback) {
        callback.apply(this);
      }
      
      // TODO -- Remove the next line if it's not required
      // this.model.save({
      //   'layoutOptions': layoutOptions,
      //   'dragLayoutOptions': dragLayoutOptions
      // }, {
      //   error: function() {
      //     console.log('error saving block');
      //   },
      //   success: _.bind(function() {
      //     if (callback) {
      //       callback.apply(this);
      //     }
      //   }, this)
      // });
    },

    deleteBlockPrompt: function(event) {
      if (event) {
        event.preventDefault();
      }
      var id = this.model.get('_id');

      var deleteBlock = {
        _type: 'prompt',
        _showIcon: true,
        title: window.polyglot.t('app.deleteblock'),
        body: window.polyglot.t('app.confirmdeleteblock') + '<br />' + '<br />' + window.polyglot.t('app.confirmdeleteblockwarning'),
        _prompts: [
          {_callbackEvent: 'editorView:deleteBlock:' + id, promptText: window.polyglot.t('app.ok')},
          {_callbackEvent: '', promptText: window.polyglot.t('app.cancel')}
        ]
      };

      Origin.trigger('notify:prompt', deleteBlock);

    },

    deleteBlock: function(event) {
      var _this = this;
      _this.model.destroy({
        success: function(model, response) {
          _this.remove();
        },
        error: function(model, response) {
          alert('An error occurred');
        }
      });
    },

    handleRemovedComponent: function() {
      this.evaluateComponents(this.render);
    },

    reRender: function() {
      this.evaluateComponents(this.render);
    },

    onCutComponent: function(view) {
      this.once('blockView:postRender', function() {
        view.showPasteZones();
      });

      this.evaluateComponents(this.render);
    },

    setupDragDrop: function() {
      var view = this;
      this.$el.draggable({
        opacity: 0.8,
        handle: '.handle',
        revert: 'invalid',
        zIndex: 10000,
        cursorAt: {
          top: 22,
          left: 0
        },
        appendTo:'.editor-view',
        containment: '.editor-view',
        helper: function (e) {
          // Store the offset to stop the page jumping during the start of drag
          // because of the drop zones changing the scroll position on the page
          view.offsetTopFromWindow = view.$el.offset().top - $(window).scrollTop();
          // This is in the helper method because the height needs to be 
          // manipulated before the drag start method due to adding drop zones
          view.showDropZones();
          $(this).attr('data-' + view.model.get('_type') + '-id', view.model.get('_id'));
          $(this).attr('data-' + view.model.get('_parent') + '-id', view.model.get('_parentId'));
          return $('<div class="drag-helper">' + view.model.get('title') + '</div>');
        },
        start: function(event) {
          // Using the initial offset we're able to position the window back in place
          $(window).scrollTop(view.$el.offset().top -view.offsetTopFromWindow);
        },
        stop: function () {
          view.hideDropZones();
        }
      });
    },

    addComponentViews: function() {
      this.$('.page-components').empty();
      var components = this.model.getChildren();
      var addPasteZonesFirst = components.length && components.at(0).get('_layout') != 'full';

      if (addPasteZonesFirst) {
        this.setupPasteZones();
      }

      // Add component elements
      this.model.getChildren().each(function(component) {
        this.$('.page-components').append(new EditorComponentView({model: component}).$el);
      }, this);

      if (!addPasteZonesFirst) {
        this.setupPasteZones();
      }
    },

    loadBlockEdit: function (event) {
      var courseId = Origin.editor.data.course.get('_id');
      var type = this.model.get('_type');
      var Id = this.model.get('_id');
      Origin.router.navigate('#/editor/' 
        + courseId 
        + '/' 
        + type 
        + '/' 
        + Id 
        + '/edit', {trigger: true});
    },

    showComponentList: function(event) {
      event.preventDefault();
      var courseId = Origin.editor.data.course.get('_id');
      var type = this.model.get('_type');
      var Id = this.model.get('_id');
      Origin.router.navigate('#/editor/' 
        + courseId 
        + '/' 
        + type 
        + '/' 
        + Id 
        + '/add', {trigger: true});
      /*Origin.router.navigate('#/editor/'+ this.model.get('_id') +'/component/add', {trigger: true});*/

    },

    addComponent: function(data) {
    },

    setupPasteZones: function() {
      // Add available paste zones
      var layouts = [];
      var dragLayouts = [];

      _.each(this.model.get('dragLayoutOptions'), function (dragLayout) {
        dragLayouts.push(dragLayout);
      });
      _.each(this.model.get('layoutOptions'), function (layout) {
        layouts.push(layout);
      });

      _.each(this.sortArrayByKey(dragLayouts, 'pasteZoneRenderOrder'), function(layout) {
        var pasteComponent = new EditorComponentModel();
        pasteComponent.set('_parentId', this.model.get('_id'));
        pasteComponent.set('_type', 'component');
        pasteComponent.set('_pasteZoneLayout', layout.type);
        var $pasteEl = new EditorComponentPasteZoneView({model: pasteComponent}).$el;
        $pasteEl.addClass('drop-only');
        this.$('.page-components').append($pasteEl);
      }, this);

      _.each(this.sortArrayByKey(layouts, 'pasteZoneRenderOrder'), function(layout) {
        var pasteComponent = new EditorComponentModel();
        pasteComponent.set('_parentId', this.model.get('_id'));
        pasteComponent.set('_type', 'component');
        pasteComponent.set('_pasteZoneLayout', layout.type);
        this.$('.page-components').append(new EditorComponentPasteZoneView({model: pasteComponent}).$el);
      }, this);
    },

    swapLayout: function (layout) {
      var newLayout = 'full';
      if (layout != 'full') {
        newLayout = (layout == 'left') ? 'right' : 'left';
      }
      return newLayout;
    }

  }, {
    template: 'editorBlock'
  });

  return EditorBlockView;

});
