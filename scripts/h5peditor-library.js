var H5PEditor = (H5PEditor || {});
var ns = H5PEditor;
var H5PIntegration = H5PIntegration || false;

/**
 * Callback for setting new parameters.
 *
 * @callback H5PEditor.newParams
 * @param {Object} field Current field details.
 * @param {Object} params New parameters.
 */

/**
 * Create a field where one can select and include another library to the form.
 *
 * @class H5PEditor.Library
 * @extends H5P.EventDispatcher
 * @param {Object} parent Parent field in editor.
 * @param {Object} field Details for current field.
 * @param {Object} params Default parameters.
 * @param {newParams} setValue Callback for setting new parameters.
 */
ns.Library = function (parent, field, params, setValue) {
  var self = this;

  H5P.EventDispatcher.call(this);
  if (params === undefined) {
    this.params = {
      params: {}
    };
    // If you do a console log here it might show that this.params is
    // something else than what we set it to. One of life's big mysteries...
    setValue(field, this.params);
  } else {
    this.params = params;
  }
  this.field = field;
  this.parent = parent;
  this.changes = [];
  this.optionsLoaded = false;
  this.library = parent.library + '/' + field.name;

  this.passReadies = true;
  parent.ready(function () {
    self.passReadies = false;
  });

  // Confirmation dialog for changing library
  this.confirmChangeLibrary = new H5P.ConfirmationDialog({
    headerText: H5PEditor.t('core', 'changeLibrary'),
    dialogText: H5PEditor.t('core', 'confirmChangeLibrary')
  }).appendTo(document.body);

  // Load library on confirmation
  this.confirmChangeLibrary.on('confirmed', function () {
    self.loadLibrary(self.$select.val());
  });

  // Revert to current library on cancel
  this.confirmChangeLibrary.on('canceled', function () {
    self.$select.val(self.currentLibrary);
  });
};

ns.Library.prototype = Object.create(H5P.EventDispatcher.prototype);
ns.Library.prototype.constructor = ns.Library;

/**
 * Append the library selector to the form.
 *
 * @alias H5PEditor.Library#appendTo
 * @param {H5P.jQuery} $wrapper
 */
ns.Library.prototype.appendTo = function ($wrapper) {
  var that = this;
  var html = '';
  if (this.field.label !== 0 && this.field.label !== undefined) {
    html = '' +
      '<div class="h5p-editor-flex-wrapper">' +
        '<label class="h5peditor-label-wrapper"><span class="h5peditor-label' + (this.field.optional ? '' : ' h5peditor-required') + '">' + (this.field.label === undefined ? this.field.name : this.field.label) + '</span></label>' +
      '</div>';
  }

  html += ns.createDescription(this.field.description);
  html = '<div class="field ' + this.field.type + '">' + html + '<select>' + ns.createOption('-', 'Loading...') + '</select>';

  // TODO: Remove errors, it is deprecated
  html += '<div class="errors h5p-errors"></div><div class="libwrap"> ' +
  '</div></div>';

  this.$myField = ns.$(html).appendTo($wrapper);
  this.$select = this.$myField.children('select');
  this.$libraryWrapper = this.$myField.children('.libwrap');
  ns.LibraryListCache.getLibraries(that.field.options, that.librariesLoaded, that);
};

/**
 * Handler for when the library list has been loaded
 *
 * @alias H5PEditor.Library#librariesLoaded
 * @param {Array} libList
 */
ns.Library.prototype.librariesLoaded = function (libList) {
  this.libraries = libList;
  var self = this;
  var options = ns.createOption('-', '-');
  for (var i = 0; i < self.libraries.length; i++) {
    var library = self.libraries[i];
    if (library.uberName === self.params.library ||
        (library.title !== undefined && (library.restricted === undefined || !library.restricted))) {
      options += ns.createOption(library.uberName, library.title, library.uberName === self.params.library);
    }
  }

  self.$select.html(options).change(function () {
    // Use timeout to avoid bug in Chrome >44, when confirm is used inside change event.
    // Ref. https://code.google.com/p/chromium/issues/detail?id=525629
    setTimeout(function () {

      // Check if library is selected
      if (self.params.library) {

        // Confirm changing library
        self.confirmChangeLibrary.show(self.$select.offset().top);
      } else {

        // Load new library
        self.loadLibrary(self.$select.val());
      }
    }, 0);
  });

  if (self.libraries.length === 1) {
    self.$select.hide();
    self.$myField.children('.h5p-editor-flex-wrapper').hide();
    self.loadLibrary(self.$select.children(':last').val(), true);
  }

  if (self.runChangeCallback === true) {
    // In case a library has been selected programmatically trigger change events, e.g. a default library.
    self.change();
    self.runChangeCallback = false;
  }
  // Load default library.
  if (this.params.library !== undefined) {
    self.loadLibrary(this.params.library, true);
  }
};

/**
 * Load the selected library.
 *
 * @alias H5PEditor.Library#loadLibrary
 * @param {string} libraryName On the form machineName.majorVersion.minorVersion
 * @param {boolean} [preserveParams]
 */
ns.Library.prototype.loadLibrary = function (libraryName, preserveParams) {
  var that = this;

  this.removeChildren();

  if (libraryName === '-') {
    delete this.params.library;
    delete this.params.params;
    delete this.params.subContentId;
    delete this.params.metadata;

    this.$libraryWrapper.attr('class', 'libwrap');
    return;
  }

  this.$libraryWrapper.html(ns.t('core', 'loading')).attr('class', 'libwrap ' + libraryName.split(' ')[0].toLowerCase().replace('.', '-') + '-editor');

  ns.loadLibrary(libraryName, function (semantics) {
    that.currentLibrary = libraryName;
    that.params.library = libraryName;

    if (preserveParams === undefined || !preserveParams) {
      // Reset params
      delete that.params.subContentId;
      that.params.params = {};
      that.params.metadata = {};
    }
    if (that.params.subContentId === undefined) {
      that.params.subContentId = H5P.createUUID();
    }
    if (that.params.metadata === undefined) {
      that.params.metadata = {};
    }

    ns.processSemanticsChunk(semantics, that.params.params, that.$libraryWrapper.html(''), that);

    if (that.libraries !== undefined) {
      that.change();
    }
    else {
      that.runChangeCallback = true;
    }

    that.addMetadataForm(semantics);
  });
};

/**
 * Add metadata form.
 *
 * @param {object} semantics - Semantics.
 */
ns.Library.prototype.addMetadataForm = function (semantics) {
  var that = this;

  // Don't add button if told so by semantics
  if (typeof this.field.options[0] === 'object') {
    const itemPosition = this.field.options
      .map(function (item) {
        return item.name;
      })
      .indexOf(this.currentLibrary);

    // By default, the metadata button should be displayed
    if (this.field.options[itemPosition].hasmetadata === false) {
      return;
    }
  }

  if (that.$metadataWrapper === undefined) {
    that.$metadataWrapper = H5PEditor.$('<div class="push-top"></div>');

    /*
     * Some content types may bring their own editor, and the title
     * fields of subcontent forms should have the ID metadata-title-sub.
     * This is far from ideal, but there's no easy connection to the dialog form.
     * Alternatively, store the current dialog title field in the custom
     * editor and implement a getter function for it.
     */
    var $syncField = H5PEditor.$(document).find('input#metadata-title-sub');
    if ($syncField.lenght === 0) {
      $syncField = undefined;
    }

    H5PEditor.metadataForm(semantics, that.params.metadata, that.$metadataWrapper, that, $syncField);
    that.$libraryWrapper.before(that.$metadataWrapper);
  }

  //Prevent multiple buttons when changing libraries
  if (that.$libraryWrapper.closest('.content').find('.h5p-metadata-button-wrapper').length === 0) {
    that.$metadataButton = H5PEditor.$('' +
      '<div class="h5p-metadata-button-wrapper">' +
        '<div class="h5p-metadata-button-tip"></div>' +
        '<div class="toggle-metadata">' + ns.t('core', 'metadata') + '</div>' +
      '</div>');

    // Put the metadataButton after the first visible label
    let label = that.$libraryWrapper.closest('.content').find('.h5p-editor-flex-wrapper').first();
    if (label.css('display') === 'none') {
      label = that.$libraryWrapper.find('.h5p-editor-flex-wrapper').first();
    }
    label.append(that.$metadataButton);

    // Add click listener
    that.$metadataButton.click(function () {
      that.$metadataWrapper.find('.h5p-metadata-wrapper').toggleClass('h5p-open');
      that.$metadataWrapper.closest('.tree').find('.overlay').toggle();
      that.$metadataWrapper.find('.h5p-metadata-wrapper').find('.field-name-title').find('input.h5peditor-text').focus();
      if (H5PIntegration && H5PIntegration.user && H5PIntegration.user.name) {
        that.$metadataWrapper.find('.field-name-authorName').find('input.h5peditor-text').val(H5PIntegration.user.name);
      }
    });
  }
};

/**
 * Add the given callback or run it.
 *
 * @alias H5PEditor.Library#change
 * @param {Function} callback
 */
ns.Library.prototype.change = function (callback) {
  if (callback !== undefined) {
    // Add callback
    this.changes.push(callback);
  }
  else {
    // Find library
    var library, i;
    for (i = 0; i < this.libraries.length; i++) {
      if (this.libraries[i].uberName === this.currentLibrary) {
        library = this.libraries[i];
        break;
      }
    }

    // Run callbacks
    for (i = 0; i < this.changes.length; i++) {
      this.changes[i](library);
    }
  }
};

/**
 * Validate this field and its children.
 *
 * @alias H5PEditor.Library#validate
 * @returns {boolean}
 */
ns.Library.prototype.validate = function () {
  var valid = true;

  if (this.children) {
    for (var i = 0; i < this.children.length; i++) {
      if (this.children[i].validate() === false) {
        valid = false;
      }
    }
  }
  else if (this.libraries && this.libraries.length) {
    valid = false;
  }

  return (this.field.optional ? true : valid);
};

/**
 * Collect functions to execute once the tree is complete.
 *
 * @alias H5PEditor.Library#ready
 * @param {Function} ready
 */
ns.Library.prototype.ready = function (ready) {
  if (this.passReadies) {
    this.parent.ready(ready);
  }
  else {
    this.readies.push(ready);
  }
};

/**
 * Custom remove children that supports common fields.
 *
 * * @alias H5PEditor.Library#removeChildren
 */
ns.Library.prototype.removeChildren = function () {
  if (this.currentLibrary === '-' || this.children === undefined) {
    return;
  }

  // Remove old metadata form and button
  if (this.$metadataWrapper) {
    this.$metadataWrapper.remove();
    delete this.$metadataWrapper;
    this.$metadataButton.remove();
    delete this.$metadataButton;
  }

  var ancestor = ns.findAncestor(this.parent);

  for (var libraryPath in ancestor.commonFields) {
    var library = libraryPath.split('/')[0];

    if (library === this.currentLibrary) {
      var remove = false;

      for (var fieldName in ancestor.commonFields[libraryPath]) {
        var field = ancestor.commonFields[libraryPath][fieldName];
        if (field.parents.length === 1) {
          field.instance.remove();
          remove = true;
        }

        for (var i = 0; i < field.parents.length; i++) {
          if (field.parents[i] === this) {
            field.parents.splice(i, 1);
            field.setValues.splice(i, 1);
          }
        }
      }

      if (remove) {
        delete ancestor.commonFields[libraryPath];
      }
    }
  }

  ns.removeChildren(this.children);
};

/**
 * Allows ancestors and widgets to do stuff with our children.
 *
 * @alias H5PEditor.Library#forEachChild
 * @param {Function} task
 */
ns.Library.prototype.forEachChild = function (task) {
  for (var i = 0; i < this.children.length; i++) {
    if (task(this.children[i], i)) {
      return;
    }
  }
};

/**
 * Called when this item is being removed.
 *
 * @alias H5PEditor.Library#remove
 */
ns.Library.prototype.remove = function () {
  this.removeChildren();
  if (this.$select !== undefined) {
    this.$select.parent().remove();
  }
};

// Tell the editor what widget we are.
ns.widgets.library = ns.Library;
