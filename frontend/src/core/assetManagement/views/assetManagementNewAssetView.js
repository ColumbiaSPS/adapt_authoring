define(function(require){

  var Backbone = require('backbone');
  var OriginView = require('coreJS/app/views/originView');
  var Origin = require('coreJS/app/origin');
  var AssetModel = require('coreJS/assetManagement/models/assetModel');
  var TagsInput = require('core/libraries/jquery.tagsinput.min');

  var AssetManagementNewAssetView = OriginView.extend({


    className: 'asset-management-new-asset',

    events: {
      'change .asset-file'          : 'onChangeFile',
    },

    preRender: function() {
        this.listenTo(Origin, 'assetManagement:newAsset', this.uploadAsset);
    },

    postRender: function() {
      // tagging
      $('#tags').tagsInput({
        autocomplete_url: '/api/autocomplete/tag',
        onAddTag: _.bind(this.onAddTag, this),
        onRemoveTag: _.bind(this.onRemoveTag, this)
      });
      // Set view to ready
      this.setViewToReady();
    },

    onChangeFile: function(event) {
      var $title = this.$('.asset-title');

      // Default 'title' -- remove C:\fakepath if it is added
      $title.val(this.$('.asset-file')[0].value.replace("C:\\fakepath\\", ""));
    },

    uploadAsset: function() {

      var title = this.$('.asset-title').val();
      var description = this.$('.asset-description').val();
      if (title && description) {
        // If model is new then uploadFile
        if (this.model.isNew()) {
          this.uploadFile();
          // Return false to prevent the page submitting
          return false;
        } else {
          // Else just update the title, description and tags
          this.model.set({title: title, description: description});
          this.model.save(null, {
            error: function(model, response, options) {
              alert('Error updating asset');
            },
            success: function(model, response, options) {
              Origin.router.navigate('#/assetManagement', {trigger:true});
            }
          })
        }
      }

      
    },

    uploadFile: function() {
      // fix tags
      var tags = [];
      _.each(this.model.get('tags'), function (item) {
        item._id && tags.push(item._id);
      });
      this.$('#tags').val(tags);

      var self = this;
      this.$('.asset-form').ajaxSubmit({

        uploadProgress: function(event, position, total, percentComplete) {
          $(".progress-container").css("visibility", "visible");
          var percentVal = percentComplete + '%';
          $(".progress-bar").css("width", percentVal);
          $('.progress-percent').html(percentVal);
        },

        error: function(xhr, status, error) {
          // console.log('Error: ' + xhr.status);
        },

        success: function(data, status, xhr) {
          Origin.trigger('assets:update');

          self.model.set({_id: data._id});
          self.model.fetch().done(function (data) {
            Origin.trigger('assetItemView:preview', self.model);
          });

          Origin.router.navigate('#/assetManagement', {trigger:true});
        }
      });

      // Return false to prevent the page submitting
      return false;
    },

    onAddTag: function (tag) {
      var model = this.model;
      $.ajax({
        url: '/api/content/tag',
        method: 'POST',
        data: { title: tag }
      }).done(function (data) {
        if (data && data._id) {
          var tags = model.get('tags') || [];
          tags.push({ _id: data._id, title: data.title });
          model.set({ tags: tags });
        }
      });
    },

    onRemoveTag: function (tag) {
      var tags = [];
      _.each(this.model.get('tags'), function (item) {
        if (item.title !== tag) {
          tags.push(item);
        }
      });
      this.model.set({ tags: tags });
    }

  }, {
    template: 'assetManagementNewAsset'
  });

  return AssetManagementNewAssetView;

});
