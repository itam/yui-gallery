YUI.add('gallery-sm-dragdrop', function (Y, NAME) {

/*global MutationObserver:true */

/*
TODO:

- Touch-based dragging needs lots of work. It's really hard to disambiguate
  between non-drag gestures and drag gestures, and to prevent undesired
  mousedown/click events after a drag.
*/

/**
Provides the `DragDrop` class, a simpler and more efficient drag and drop
implementation than the one in YUI core.

@module gallery-sm-dragdrop
@main gallery-sm-dragdrop
**/

/**
A simpler and more efficient drag and drop implementation than the one in YUI
core. Highly optimized for delegation-based drag targets, remaining responsive
and memory-efficient even when managing thousands of draggable nodes.

@class DragDrop
@extends Base
@constructor
**/

var DOM = Y.DOM,

    doc          = Y.config.doc,
    getClassName = Y.ClassNameManager.getClassName,
    isMac        = typeof navigator !== 'undefined' && /^mac/i.test(navigator.platform),
    win          = Y.config.win,

    MutationObserver = win.MutationObserver || win.WebKitMutationObserver ||
        win.MozMutationObserver;

/**
Fired whenever the pointer moves during a drag operation.

Call the `preventDefault()` method on this event's facade to prevent the dragged
node (or its proxy) from being moved to the new location, and to prevent drop
zone intersections from being calculated.

@event drag
@param {Number[]} deltaXY Number of pixels the pointer has moved on the X and Y
    axes since the drag operation began.
@param {Node} dragNode The node being dragged.
@param {Number[]} pageXY Current X and Y coordinates of the pointer.
@param {Number[]} startXY X and Y coordinates of the pointer when the drag
    operation began.
@preventable _defDragFn
**/
var EVT_DRAG = 'drag';

/**
Fired after a drag operation ends or is canceled.

@event dragend
@param {Number[]} deltaXY Number of pixels the pointer has moved on the X and Y
    axes since the drag operation began.
@param {Node} dragNode The node that was dragged.
@param {Number[]} pageXY Current X and Y coordinates of the pointer.
@param {Number[]} startXY X and Y coordinates of the pointer when the drag
    operation began.
**/
var EVT_DRAG_END = 'dragend';

/**
Fired when the pointer enters a drop zone during a drag operation.

To prevent the drop zone from being treated as a valid drop target, call
`preventDefault()` on this event's facade.

@event dragenter
@param {Number[]} deltaXY Number of pixels the pointer has moved on the X and Y
    axes since the drag operation began.
@param {Node} dragNode The node being dragged.
@param {Node} dropNode The node representing the drop zone.
@param {Number[]} pageXY Current X and Y coordinates of the pointer.
@param {Number[]} startXY X and Y coordinates of the pointer when the drag
    operation began.
@preventable _defDragEnterFn
**/
var EVT_DRAG_ENTER = 'dragenter';

/**
Fired after the pointer leaves a drop zone during a drag operation.

@event dragleave
@param {Number[]} deltaXY Number of pixels the pointer has moved on the X and Y
    axes since the drag operation began.
@param {Node} dragNode The node being dragged.
@param {Node} dropNode The node representing the drop zone.
@param {Number[]} pageXY Current X and Y coordinates of the pointer.
@param {Number[]} startXY X and Y coordinates of the pointer when the drag
    operation began.
**/
var EVT_DRAG_LEAVE = 'dragleave';

/**
Fired when the pointer moves over a drop zone during a drag operation.

@event dragover
@param {Number[]} deltaXY Number of pixels the pointer has moved on the X and Y
    axes since the drag operation began.
@param {Node} dragNode The node being dragged.
@param {Node} dropNode The node representing the drop zone.
@param {Number[]} pageXY Current X and Y coordinates of the pointer.
@param {Number[]} startXY X and Y coordinates of the pointer when the drag
    operation began.
**/
var EVT_DRAG_OVER = 'dragover';

/**
Fired when a drag operation begins.

You can override the pointer offset specified in the `pointerOffset` attribute
by setting a `pointerOffset` property on the event facade during the "on" phase
of this event. This custom pointer offset will then be used only for the current
drag operation.

To cancel the drag operation, call `preventDefault()` on this event's facade.

@event dragstart
@param {Node} dragNode The node being dragged.
@param {Number[]} pageXY Current X and Y coordinates of the pointer.
@preventable _defDragStartFn
**/
var EVT_DRAG_START = 'dragstart';

/**
Fired after a draggable node is dropped onto a node marked as a drop zone.

@event drop
@param {Number[]} deltaXY Number of pixels the pointer has moved on the X and Y
    axes since the drag operation began.
@param {Node} dragNode The node being dragged.
@param {Node} dropNode The node representing the drop zone.
@param {Number[]} pageXY Current X and Y coordinates of the pointer.
@param {Number[]} startXY X and Y coordinates of the pointer when the drag
    operation began.
**/
var EVT_DROP = 'drop';

var DragDrop = Y.Base.create('dragdrop', Y.Base, [], {
    // -- Public Properties ----------------------------------------------------

    /**
    CSS class names used by DragDrop.

    @property {Object} classNames
    @param classNames.dragging Class name applied to a node or proxy node that's
        being dragged.
    @param classNames.dragover Class name applied to a dropzone node over which
        a draggable node is currently being dragged.
    @param classNames.droppable Class name applied to a node or proxy node
        that's currently being dragged and can be dropped.
    **/
    classNames: {
        dragging : getClassName('dragging'),
        dragover : getClassName('dragover'),
        droppable: getClassName('droppable')
    },

    // -- Lifecycle ------------------------------------------------------------
    initializer: function () {
        this._dragState       = {};
        this._publishedEvents = {};

        // Cache frequently-used attributes.
        this._container          = this.get('container');
        this._distanceThreshold  = this.get('distanceThreshold');
        this._dragHandleSelector = this.get('dragHandleSelector');
        this._dragSelector       = this.get('dragSelector');
        this._scrollContainer    = this.get('scrollContainer');
        this._scrollMargin       = this.get('scrollMargin');
        this._scrollSelector     = this.get('scrollSelector');

        if (this._container === Y.one('body')) {
            this._containerIsBody = true;
        }

        this._attachEvents();
    },

    destructor: function () {
        this._endDrag();
        this._detachEvents();

        this._dragState       = null;
        this._publishedEvents = null;
    },

    // -- Public Methods -------------------------------------------------------

    /**
    Synchronizes the internal cache of dropzone node locations, which is used to
    determine whether a dragged node may be dropped.

    You should call this method if you modify the DOM or change the position or
    metrics of a dropzone node during a drag operation. Otherwise, dropzone
    positions may be miscalculated.

    Calling this method when a drag operation is not in progress will have no
    effect.

    @method sync
    @chainable
    **/
    sync: function () {
        if (this._dragState.dragging) {
            this._cacheBoundingRects();

            if (this._scrollContainer || this._scrollSelector) {
                this._cacheScrollRects();
            }
        }

        return this;
    },

    // -- Protected Methods ----------------------------------------------------

    /**
    Attaches event handlers.

    @method _attachEvents
    @protected
    **/
    _attachEvents: function () {
        if (this._events) {
            this._detachEvents();
        }

        var container    = this._container,
            doc          = Y.one(Y.config.doc),
            dragSelector = this._dragSelector;

        this._events = [
            this.after([
                'containerChange',
                'distanceThresholdChange',
                'dragHandleSelectorChange',
                'dragSelectorChange',
                'scrollContainerChange',
                'scrollMarginChange',
                'scrollSelectorChange'
            ], this._cacheAttrValue),

            this.after([
                'containerChange',
                'distanceThresholdChange',
                'dragSelectorChange',
                'enableTouchDragChange',
                'timeThresholdChange',
                'useMutationObserverChange'
            ], this._reinitialize),

            this.after([
                'dropSelectorChange',
                'scrollContainerChange',
                'scrollSelectorChange'
            ], this.sync),

            container.delegate('dragstart', this._onNativeDragStart, dragSelector, this),
            container.delegate('gesturemovestart', this._onDraggableMoveStart, dragSelector, {}, this),

            doc.on('gesturemove', this._onDocMove, {standAlone: true}, this),
            doc.on('gesturemoveend', this._onDocMoveEnd, {standAlone: true}, this)
        ];

        // If supported and enabled, a MutationObserver is used to update cached
        // dropzone bounding rects when the DOM is modified during a drag
        // operation.
        if (MutationObserver && this.get('useMutationObserver')) {
            this._mutationObserver = new MutationObserver(
                Y.bind(this.sync, this));
        }
    },

    /**
    Attribute change event handler that caches the new value of the attribute in
    a protected property on this class.

    @method _cacheAttrValue
    @param {EventFacade} e
    @protected
    **/
    _cacheAttrValue: function (e) {
        this['_' + e.attrName] = e.newVal;
    },

    /**
    Caches bounding rect information for every node in the container that
    matches the `dropSelector`.

    This is used during a drag to compute dropzone intersections with the
    dragged node, since mouse events can't be used when the dragged node
    obscures the dropzone.

    @method _cacheBoundingRects
    @return {Object[]} Array of bounding rects.
    @protected
    **/
    _cacheBoundingRects: function () {
        var dragEl    = this._proxyOrDragNode()._node,
            dropEls   = Y.Selector.query(this.get('dropSelector'), this._container._node),
            dropRects = this._dropRects = [],
            dropEl, rect;

        for (var i = 0, len = dropEls.length; i < len; i++) {
            dropEl = dropEls[i];

            if (dropEl !== dragEl) {
                rect    = this._getBoundingRect(dropEl);
                rect.el = dropEl;

                dropRects.push(rect);
            }
        }

        // Sort the rects by top pixel, then by left pixel.
        dropRects.sort(function (a, b) {
            return (a.top - b.top) || (a.left - b.left);
        });
    },

    /**
    Caches bounding rect information for all scrollable elements.

    This is used during a drag to figure out when we need to auto-scroll a node
    the pointer is being dragged over.

    @method _cacheScrollRects
    @return {Object[]} Array of bounding rects.
    @protected
    **/
    _cacheScrollRects: function () {
        var scrollRects = this._scrollRects = [],
            scrollEls   = [];

        if (this._scrollContainer) {
            scrollEls.push(this._container._node);
        }

        if (this._scrollSelector) {
            Array.prototype.push.apply(scrollEls,
                Y.Selector.query(this._scrollSelector, this._container._node));
        }

        if (!scrollEls.length) {
            return scrollRects;
        }

        var el,
            isHorizontal,
            isVertical,
            rect;

        for (var i = 0, len = scrollEls.length; i < len; i++) {
            el = scrollEls[i];

            // Is this element even scrollable? If not, skip it to save time
            // during drag operations.
            isVertical   = el.scrollHeight > el.clientHeight;
            isHorizontal = el.scrollWidth > el.clientWidth;

            if (isVertical || isHorizontal) {
                rect              = this._getBoundingRect(el);
                rect.el           = el;
                rect.isVertical   = isVertical;
                rect.isHorizontal = isHorizontal;

                scrollRects.push(rect);
            }
        }

        // Sort the rects by top pixel, then by left pixel.
        scrollRects.sort(function (a, b) {
            return (a.top - b.top) || (a.left - b.left);
        });

        return scrollRects;
    },

    /**
    Detaches event handlers.

    @method _detachEvents
    @protected
    **/
    _detachEvents: function () {
        if (this._events) {
            new Y.EventHandle(this._events).detach();
            this._events = null;
        }

        if (this._mutationObserver) {
            this._mutationObserver.disconnect();
            this._mutationObserver = null;
        }
    },

    /**
    Ends a drag operation, cleans up after it, and fires a `dragend` event.

    @method _endDrag
    @protected
    **/
    _endDrag: function () {
        var state = this._dragState;

        if (state.pending) {
            this._endPendingDrag();
        } else if (state.dragging) {
            if (state.dropNode) {
                this._fireDragLeave();
            }

            if (this._mutationObserver) {
                this._mutationObserver.disconnect();
            }

            this._proxyOrDragNode().removeClass(this.classNames.dragging);

            this._publishAndFire(EVT_DRAG_END, Y.merge(state, {
                deltaXY: this._getDelta(),
                state  : state
            }));
        }

        this._dragState           = {};
        this._dropRects           = null;
        this._scrollIntersections = null;
        this._scrollRects         = null;
        this._scrollTimeout       = clearTimeout(this._scrollTimeout);
    },

    /**
    Ends a pending drag operation and cleans up after the pending state.

    This doesn't prevent a drag operation from starting; it just cleans up
    temporary state that's only necessary when a drag is pending.

    @method _endPendingDrag
    @protected
    **/
    _endPendingDrag: function () {
        this._pendingDragTimeout = clearTimeout(this._pendingDragTimeout);
        this._restoreTouchCallout();
    },

    /**
    Searches for a cached drop zone bounding rect that intersects with the
    current pointer position, and returns the intersected element if found.

    @method _findDropIntersection
    @return {HTMLElement|null} Intersected drop zone element, or `null` if no
        intersection found.
    @protected
    **/
    _findDropIntersection: function () {
        var dropRects      = this._dropRects,
            state          = this._dragState,
            originalDragEl = state.dragNode._node, // original drag node, never a proxy
            pointerX       = state.pageXY[0],
            pointerY       = state.pageXY[1],
            dropRect;

        for (var i = 0, len = dropRects.length; i < len; i++) {
            dropRect = dropRects[i];

            // Short-circuit if possible. The dropRects array is sorted by top
            // left coords, so if the pointer is above the top of the dropRect,
            // we can stop iterating because we know no subsequent rects will
            // intersect.
            if (pointerY < dropRect.top) {
                return null;
            }

            if (originalDragEl !== dropRect.el
                    && pointerY <= dropRect.bottom
                    && pointerY >= dropRect.top
                    && pointerX <= dropRect.right
                    && pointerX >= dropRect.left) {

                return dropRect.el;
            }
        }
    },

    /**
    Searches for cached scroll zone bounding rects in which the pointer is
    currently within the scroll margin (the area near an element's border that
    should cause the element to scroll).

    Returns an array of all intersected scroll zones.

    @method _findScrollIntersections
    @return {Object[]} Array of intersected scroll zones.
    @protected
    **/
    _findScrollIntersections: function () {
        var intersections = [],
            scrollRects   = this._scrollRects;

        if (!scrollRects.length) {
            return intersections;
        }

        var scrollMargin  = this._scrollMargin,
            state         = this._dragState,
            pointerX      = state.pageXY[0],
            pointerY      = state.pageXY[1],

            scrollData,
            scrollRect;

        for (var i = 0, len = scrollRects.length; i < len; i++) {
            scrollRect = scrollRects[i];

            // Short-circuit if possible. The scrollRects array is sorted by top
            // left coords, so if the pointer is above the top of the
            // scrollRect, we can stop iterating because we know no subsequent
            // rects will intersect.
            if (pointerY < scrollRect.top) {
                break;
            }

            // Is the pointer inside the scrollRect?
            if (pointerY <= scrollRect.bottom
                    && pointerY >= scrollRect.top
                    && pointerX <= scrollRect.right
                    && pointerX >= scrollRect.left) {

                scrollData = {el: scrollRect.el};

                // Do we need to scroll down or up?
                if (scrollRect.isVertical) {
                    if (scrollRect.bottom - pointerY <= scrollMargin) {
                        scrollData.down = true;
                    } else if (pointerY - scrollRect.top <= scrollMargin) {
                        scrollData.up = true;
                    }
                }

                // Do we need to scroll right or left?
                if (scrollRect.isHorizontal) {
                    if (scrollRect.right - pointerX <= scrollMargin) {
                        scrollData.right = true;
                    } else if (pointerX - scrollRect.left <= scrollMargin) {
                        scrollData.left = true;
                    }
                }

                if (scrollData.down || scrollData.up || scrollData.right ||
                        scrollData.left) {

                    intersections.push(scrollData);
                }
            }
        }

        return intersections;
    },

    /**
    Fires a `drag` event and, if necessary, a `dragover` event.

    @method _fireDrag
    @protected
    **/
    _fireDrag: function () {
        var deltaXY = this._getDelta(),
            state   = this._dragState;

        this._publishAndFire(EVT_DRAG, Y.merge(state, {
            deltaXY: deltaXY,
            state  : state
        }), {
            defaultFn  : this._defDragFn
        });

        if (state.dropNode) {
            this._publishAndFire(EVT_DRAG_OVER, Y.merge(state, {
                deltaXY: deltaXY,
                state  : state
            }));
        }
    },

    /**
    Fires a `dragenter` event for the specified dropzone node.

    @method _fireDragEnter
    @param {Node} dropNode Dropzone node that was entered.
    @protected
    **/
    _fireDragEnter: function (dropNode) {
        var state = this._dragState;

        state.preventedDropNode = null;

        this._publishAndFire(EVT_DRAG_ENTER, Y.merge(state, {
            deltaXY : this._getDelta(),
            dropNode: dropNode,
            state   : state
        }), {
            defaultFn  : this._defDragEnterFn,
            preventedFn: this._preventedDragEnterFn
        });
    },

    /**
    Fires a `dragleave` event.

    @method _fireDragLeave
    @protected
    **/
    _fireDragLeave: function () {
        var state = this._dragState;

        this._proxyOrDragNode().removeClass(this.classNames.droppable);
        state.dropNode.removeClass(this.classNames.dragover);

        this._publishAndFire(EVT_DRAG_LEAVE, Y.merge(state, {
            deltaXY: this._getDelta(),
            state  : state
        }));

        state.dropNode          = null;
        state.preventedDropNode = null;
    },

    /**
    Fires a `dragstart` event, but only if `this._dragState.pending` is `true`.

    @method _fireDragStart
    @protected
    **/
    _fireDragStart: function () {
        var state = this._dragState;

        if (!state.pending) {
            return;
        }

        this._endPendingDrag();

        this._publishAndFire(EVT_DRAG_START, Y.merge(state, {
            state: state
        }), {
            defaultFn  : this._defDragStartFn,
            preventedFn: this._preventedDragStartFn
        });
    },

    /**
    Returns a bounding rect for _el_ with absolute coordinates corrected for
    scroll positions.

    The native `getBoundingClientRect()` returns coordinates for an element's
    visual position relative to the top left of the viewport, so if the element
    is part of a scrollable region that has been scrolled, its coordinates will
    be different than if the region hadn't been scrolled.

    This method corrects for scroll offsets all the way up the node tree, so the
    returned bounding rect will represent an absolute position on a virtual
    canvas, regardless of scrolling.

    @method _getAbsoluteBoundingRect
    @param {HTMLElement} el HTML element.
    @return {Object} Absolute bounding rect for _el_.
    @protected
    **/
    _getAbsoluteBoundingRect: function (el) {
        var body = doc.body,

            // pageXOffset and pageYOffset work everywhere except IE <9.
            offsetX = win.pageXOffset !== undefined ? win.pageXOffset :
                (doc.documentElement || body.parentNode || body).scrollLeft,
            offsetY = win.pageYOffset !== undefined ? win.pageYOffset :
                (doc.documentElement || body.parentNode || body).scrollTop,

            rect = el.getBoundingClientRect();

        if (el !== body) {
            var parent = el.parentNode;

            // The element's rect will be affected by the scroll positions of
            // *all* of its scrollable parents, not just the window, so we have
            // to walk up the tree and collect every scroll offset. Good times.
            while (parent !== body) {
                offsetX += parent.scrollLeft;
                offsetY += parent.scrollTop;
                parent   = parent.parentNode;
            }
        }

        return {
            bottom: rect.bottom + offsetY,
            height: rect.height || rect.bottom - rect.top,
            left  : rect.left + offsetX,
            right : rect.right + offsetX,
            top   : rect.top + offsetY,
            width : rect.width || rect.right - rect.left
        };
    },

    /**
    Returns a bounding rect for _el_, normalizing for older versions of IE that
    don't provide height and width information in native bounding rects.

    @method _getBoundingRect
    @param {HTMLElement} el HTML element.
    @return {Object} Bounding rect for _el_.
    @protected
    **/
    _getBoundingRect: function (el) {
        var rect = el.getBoundingClientRect();

        // Have to return a new object in IE<9 or it'll freak out.
        return 'width' in rect ? rect : {
            bottom: rect.bottom,
            height: rect.height || rect.bottom - rect.top,
            left  : rect.left,
            right : rect.right,
            top   : rect.top,
            width : rect.width || rect.right - rect.left
        };
    },

    /**
    Returns the XY delta between where the pointer was at the start of the
    current drag operation and where the pointer is now.

    @method _getDelta
    @return {Number[]} Array containing the X and Y deltas.
    @protected
    **/
    _getDelta: function () {
        var state = this._dragState;

        return [
            Math.abs(state.startXY[0] - state.pageXY[0]),
            Math.abs(state.startXY[1] - state.pageXY[1])
        ];
    },

    /**
    Moves the dragged node or its proxy to the current pointer location, but
    constrained within the container if the pointer is outside the container.

    @method _moveDragNode
    @protected
    **/
    _moveDragNode: function () {
        var proxyDragEl = this._proxyOrDragNode()._node, // proxy node or drag node
            state       = this._dragState;

        if (this._containerIsBody) {
            // Don't constrain if the container is the body, since the body's
            // rect might not actually encompass absolutely positioned or
            // floated nodes.
            DOM.setXY(proxyDragEl, [
                state.pageXY[0] + state.offsetXY[0],
                state.pageXY[1] + state.offsetXY[1]
            ]);
        } else {
            var containerRect = this._getAbsoluteBoundingRect(this._container._node),
                dragRect      = this._getBoundingRect(proxyDragEl);

            DOM.setXY(proxyDragEl, [
                Math.max(
                    containerRect.left,

                    Math.min(
                        containerRect.right - dragRect.width,
                        state.pageXY[0] + state.offsetXY[0]
                    )
                ),

                Math.max(
                    containerRect.top,

                    Math.min(
                        containerRect.bottom - dragRect.height,
                        state.pageXY[1] + state.offsetXY[1]
                    )
                )
            ]);
        }
    },

    /**
    Prevents the WebKit long-touch callout menu from appearing on the current
    dragNode, if any.

    @method _preventTouchCallout
    @protected
    @see _restoreTouchCallout
    **/
    _preventTouchCallout: function () {
        var node = this._dragState.dragNode,
            el   = node && node._node;

        if (el) {
            node.setData('originalTouchCalloutValue',
                    el.style.webkitTouchCallout);

            el.style.webkitTouchCallout = 'none';
        }
    },

    /**
    Returns the proxy node associated with the current drag operation, or the
    original dragged node if node proxy node is set.

    @method _proxyOrDragNode
    @return {Node} Proxy node or original dragged node.
    @protected
    **/
    _proxyOrDragNode: function () {
        return this._dragState.proxyNode || this._dragState.dragNode;
    },

    /**
    Utility method for lazily publishing and firing events.

    @method _publishAndFire
    @param {String} name Event name to fire.
    @param {Object} facade Event facade.
    @param {Object} [options] Event options.
        @param {Boolean} [options.silent=false] Whether the default handler
            should be executed directly without actually firing the event.
    @chainable
    @protected
    **/
    _publishAndFire: function (name, facade, options) {
        if (options && options.silent) {
            if (options.defaultFn) {
                options.defaultFn.call(this, facade);
            }
        } else {
            if (options && !this._publishedEvents[name]) {
                this._publishedEvents[name] = this.publish(name, options);
            }

            this.fire(name, facade);
        }

        return this;
    },

    /**
    Detaches and reattaches event handlers.

    This is necessary after the `container`, `dragSelector`, or `dropSelector`
    attributes are changed.

    @method _reinitialize
    @protected
    **/
    _reinitialize: function () {
        this._endDrag();

        if (this._container === Y.one('body')) {
            this._containerIsBody = true;
        }

        this._detachEvents();
        this._attachEvents();
    },

    /**
    Restores the original value of the current dragNode's `webkitTouchCallout`
    style before it was prevented by `_preventTouchCallout()`.

    @method _restoreTouchCallout
    @protected
    @see _preventTouchCallout
    **/
    _restoreTouchCallout: function () {
        var node = this._dragState.dragNode,
            el   = node && node._node;

        if (el) {
            el.style.webkitTouchCallout =
                node.getData('originalTouchCalloutValue') || 'default';

            node.clearData('originalTouchCalloutValue');
        }
    },

    /**
    Begins scrolling all currently intersected scroll zones in whichever
    direction(s) they need to be scrolled.

    Scrolling will continue (and will accelerate in speed) until the
    `_scrollIntersections` property is empty.

    @method _scroll
    @param {Number} [amount=1] Number of pixels to scroll. Scrolling will
        automatically accelerate as long as the pointer remains within a scroll
        margin.
    @protected
    **/
    _scroll: function (amount) {
        var intersections = this._scrollIntersections,
            len           = intersections && intersections.length;

        if (!len) {
            return;
        }

        var scrollData, scrollEl;

        amount || (amount = 1);

        for (var i = 0; i < len; i++) {
            scrollData = intersections[i];
            scrollEl   = scrollData.el;

            if (scrollData.down) {
                scrollEl.scrollTop = Math.min(
                    scrollEl.scrollHeight,
                    scrollEl.scrollTop + amount
                );
            } else if (scrollData.up) {
                scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop - amount);
            }

            if (scrollData.right) {
                scrollEl.scrollLeft = Math.min(
                    scrollEl.scrollWidth,
                    scrollEl.scrollLeft + amount
                );
            } else if (scrollData.left) {
                scrollEl.scrollLeft = Math.max(0, scrollEl.scrollLeft - amount);
            }
        }

        // Re-cache bounding rects after scrolling, since they may have changed.
        this.sync();

        // Keep scrolling as long as there are still scroll intersections.
        if (!this._scrollTimeout) {
            var self = this;

            this._scrollTimeout = setTimeout(function () {
                self._scrollTimeout = null;
                self._scroll(amount += 1); // accelerate scroll speed

                // Update the position of the drag node, since it might have
                // moved as a result of the scroll and we need it to stick to
                // the pointer. This is only necessary after a timer-triggered
                // scroll, since _defDragFn will move the dragNode after a
                // manually-triggered scroll.
                self._moveDragNode();
            }, 20);
        }
    },

    // -- Event Handlers -------------------------------------------------------

    /**
    Default handler for the `drag` event.

    @method _defDragFn
    @protected
    **/
    _defDragFn: function () {
        var state = this._dragState;

        if (this._scrollContainer || this._scrollSelector) {
            this._scrollIntersections = this._findScrollIntersections();
            this._scroll();
        }

        this._moveDragNode();

        var intersectEl = this._findDropIntersection();

        if (intersectEl) {
            if (state.dropNode) {
                // Don't do anything if the intersected node is already marked
                // as the current dropNode.
                if (intersectEl === state.dropNode._node) {
                    return;
                }

                // The intersected node is not the current dropNode, so fire a
                // dragleave event for the old dropNode.
                this._fireDragLeave();

            } else if (state.preventedDropNode
                    && intersectEl === state.preventedDropNode._node) {

                // Don't do anything if the intersected node was a potential
                // dropNode that was rejected by a preventDefault() call on
                // the `dragenter` event.
                return;
            }

            this._fireDragEnter(Y.one(intersectEl));

        } else if (state.dropNode) {
            // We previously had a dropNode but we're no longer over that node,
            // so fire a dragleave event for it.
            this._fireDragLeave();
        }
    },

    /**
    Default handler for the `dragenter` event.

    @method _defDragEnterFn
    @param {EventFacade} e
    @protected
    **/
    _defDragEnterFn: function (e) {
        this._dragState.dropNode = e.dropNode;

        this._proxyOrDragNode().addClass(this.classNames.droppable);
        e.dropNode.addClass(this.classNames.dragover);
    },

    /**
    Default handler for the `dragstart` event.

    @method _defDragStartFn
    @param {EventFacade} e
    @protected
    **/
    _defDragStartFn: function (e) {
        var state         = this._dragState,
            nodeXY        = state.dragNode.getXY(),
            pointerOffset = e.pointerOffset || this.get('pointerOffset');

        state.dragging = true;
        state.pending  = false;

        if (pointerOffset === 'auto') {
            // This is the offset in pixels between the pointer position at the
            // start of the drag and the position of the node being dragged. We use
            // it to ensure that the grabbed point on the dragged node remains
            // consistent throughout the drag operation.
            state.offsetXY = [
                nodeXY[0] - state.startXY[0],
                nodeXY[1] - state.startXY[1]
            ];
        } else {
            state.offsetXY = pointerOffset;
        }

        state.dragNode.addClass(this.classNames.dragging);
        this._proxyOrDragNode().addClass(this.classNames.dragging);

        this.sync();

        if (this._mutationObserver) {
            // Activate the mutation observer. This will automatically update
            // cached dropzone bounding rects whenever the container or one of
            // its descendants is modified in the DOM.
            this._mutationObserver.observe(this._container._node, {
                attributes   : true,
                characterData: true,
                childList    : true,
                subtree      : true
            });
        }

        this._fireDrag();
    },

    /**
    Handler for the `gesturemove` event.

    @method _onDocMove
    @param {EventFacade} e
    @protected
    **/
    _onDocMove: function (e) {
        var state = this._dragState;

        if (!(state.dragging || state.pending)) {
            return;
        }

        state.pageXY = [e.pageX, e.pageY];

        if (state.dragging) {
            // This is necessary to prevent the page from scrolling on touch
            // devices.
            e.preventDefault();

            this._fireDrag();
        } else if (state.pending) {
            // TODO: Figure out how to avoid stomping on touch-based scroll
            // gestures and whatnot.
            var deltaXY   = this._getDelta(),
                threshold = this._distanceThreshold;

            if (deltaXY[0] > threshold || deltaXY[1] > threshold) {
                this._fireDragStart();
            }
        }
    },

    /**
    Handler for the `gesturemoveend` event.

    @method _onDocMoveEnd
    @protected
    **/
    _onDocMoveEnd: function (e) {
        var state = this._dragState;

        if (!(state.dragging || state.pending)) {
            return;
        }

        if (state.dragging) {
            if (e._event.preventDefault) {
                e._event.preventDefault();
            } else {
                // IE <9
                e._event.returnValue = false;
            }

            // If this is a touch event, we need to prevent the mousedown event
            // separately. Note: there's still a potential issue here since any
            // `on`-stage event handler that was subscribed before ours will
            // still get called. Unfortunately there isn't much we can do about
            // that.
            if (e.touches) {
                state.dragNode.once('mousedown', function (e) {
                    e.preventDefault();
                });

                state.dragNode.once('click', function (e) {
                    e.preventDefault();
                });
            }

            if (state.dropNode) {
                this._publishAndFire(EVT_DROP, Y.merge(state, {
                    deltaXY: this._getDelta(),
                    state  : state
                }));
            }
        }

        this._endDrag();
    },

    /**
    Handler for the `gesturemovestart` event.

    @method _onDraggableMoveStart
    @param {EventFacade} e
    @protected
    **/
    _onDraggableMoveStart: function (e) {
        // Ignore right-clicks (and Ctrl-clicks on Macs, which are equivalent).
        if (e.button > 1 || (isMac && e.ctrlKey)) {
            return;
        }

        // Ignore touch events if `enableTouchDrag` is false.
        if (e.touches && !this.get('enableTouchDrag')) {
            return;
        }

        // If a dragHandleSelector is set and the node that was grabbed doesn't
        // match the selector, abort the drag operation.
        var handleSelector = this._dragHandleSelector;

        if (handleSelector && !e.target.ancestor(handleSelector, true)) {
            return;
        }

        var self  = this,
            state = this._dragState;

        state.dragging = false;
        state.dragNode = e.currentTarget;
        state.pageXY   = [e.pageX, e.pageY];
        state.pending  = true;
        state.startXY  = [e.pageX, e.pageY];

        this._preventTouchCallout();

        this._pendingDragTimeout = setTimeout(function () {
            self._fireDragStart();
        }, this.get('timeThreshold'));
    },

    /**
    Handles native `dragstart` events on draggable nodes.

    The default behavior of these events must be prevented in order to avoid
    conflicts.

    @method _onNativeDragStart
    @param {EventFacade} e
    @protected
    **/
    _onNativeDragStart: function (e) {
        e.preventDefault();
    },

    /**
    Called when the `dragenter` event's default handler is prevented.

    This will prevent the entered node from being considered a valid dropzone.

    @method _preventedDragEnterFn
    @param {EventFacade} e
    @protected
    **/
    _preventedDragEnterFn: function (e) {
        e.state.preventedDropNode = e.dropNode;
    },

    /**
    Called when the `dragstart` event's default handler is prevented.

    This will cancel the drag operation.

    @method _preventedDragStartFn
    @protected
    **/
    _preventedDragStartFn: function () {
        this._endDrag();
    }
}, {
    ATTRS: {
        /**
        Container node to which drag operations should be constrained. All
        draggable nodes and dropzones must be descendants of this container, and
        draggable nodes will not be draggable or droppable outside its borders.

        If not specified, the `<body>` element will be used as the container.

        @attribute {HTMLElement|Node|String} container
        @default 'body'
        **/
        container: {
            setter: Y.one,

            valueFn: function () {
                return Y.one('body');
            }
        },

        /**
        Distance in pixels that the mouse cursor must move after a mousedown
        before the movement will be considered the beginning of a drag event.

        This value has no effect on touch-based interactions (see
        `maxGestureDistance`).

        @attribute {Number} distanceThreshold
        @default 10
        **/
        distanceThreshold: {
            value: 10
        },

        /**
        CSS selector that matches one or more nodes within a draggable node that
        should be treated as drag handles for that node.

        If a `dragHandleSelector` is set, nodes matched by `dragSelector` will
        only be draggable by their handles.

        @attribute {String} dragHandleSelector
        **/
        dragHandleSelector: {},

        /**
        CSS selector that matches one or more nodes within the `container` that
        should be draggable.

        @attribute {String} dragSelector
        **/
        dragSelector: {},

        /**
        CSS selector that matches one or more nodes within the `container` that
        should be considered drop zones.

        @attribute {String} dropSelector
        **/
        dropSelector: {},

        /**
        Whether or not to enable dragging in response to touch events. There are
        currently some edge cases with this, which is why it might make sense to
        disable it in certain situations.

        @attribute {Boolean} enableTouchDrag
        @default true
        **/
        enableTouchDrag: {
            value: true
        },

        /**
        Array of custom X and Y pixel offset values specifying how the dragged
        node or proxy node should be positioned relative to the pointer
        position, or the string "auto" for an automatic offset based on the
        initial grab point.

        You can override the pointer offset specified here on a per-drag basis
        by setting a `pointerOffset` property on the event facade passed to the
        "on" phase of the `dragstart` event.

        @attribute {Number[]|String} pointerOffset
        @default 'auto'
        **/
        pointerOffset: {
            value: 'auto'
        },

        /**
        Whether or not to automatically scroll the container if necessary when
        the pointer approaches an edge during a drag operation.

        If it's necessary to auto-scroll nodes other than the container, select
        those nodes using the `scrollSelector` attribute.

        @attribute {Boolean} scrollContainer
        **/
        scrollContainer: {
            value: false
        },

        /**
        Distance in pixels from the edge of a scrollable node at which the
        pointer will cause the node to begin scrolling during a drag operation.

        The smaller this number is, the closer the pointer will have to be to
        the edge before the node will start to scroll.

        @attribute {Number} scrollMargin
        @default 50
        **/
        scrollMargin: {
            value: 50
        },

        /**
        CSS selector that matches scrollable nodes within the `container` that
        should be automatically scrolled when the pointer is dragged near the
        node's edges.

        @attribute {String} scrollSelector
        **/
        scrollSelector: {},

        /**
        Amount of time in milliseconds that must pass after a mousedown or tap
        without a corresponding mouseup or release before we'll consider the
        action the beginning of a drag event.

        For mouse-based interactions, exceeding this threshold will cause a
        drag event to start even if the `distanceThreshold` is not met.

        For touch-based interactions, a drag event will only start if this
        threshold is exceeded *and* the touch point doesn't move more than the
        number of pixels specified by `maxGestureDistance`.

        @attribute {Number} timeThreshold
        @default 800
        **/
        timeThreshold: {
            value: 800
        },

        /**
        Whether or not to use a MutationObserver in capable browsers to
        automatically detect changes to drop zone nodes during a drag operation.

        This can be more convenient than manually calling `sync()` whenever a
        drop zone changes, but it only works in very modern browsers and may
        result in poor performance if frequent changes are made to drop zone
        nodes during a drag operation.

        It should be considered experimental.

        @attribute {Boolean} useMutationObserver
        @default false
        **/
        useMutationObserver: {
            value: false
        }
    }
});

Y.DragDrop = DragDrop;


}, '@VERSION@', {"requires": ["base", "classnamemanager", "event-move", "node-event-delegate", "node-screen"]});
