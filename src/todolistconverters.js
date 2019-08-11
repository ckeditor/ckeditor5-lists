/**
 * @license Copyright (c) 2003-2019, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module list/todolistconverters
 */

/* global document */

import { generateLiInUl, injectViewList, findInRange } from './utils';
import createElement from '@ckeditor/ckeditor5-utils/src/dom/createelement';

/**
 * A model-to-view converter for `listItem` model element insertion.
 *
 * It converts `listItem` model element to an unordered list with {@link module:engine/view/uielement~UIElement checkbox element}
 * at the beginning of each list item. It also merges the list with surrounding lists (if available).
 *
 * It is used by {@link module:engine/controller/editingcontroller~EditingController}.
 *
 * @see module:engine/conversion/downcastdispatcher~DowncastDispatcher#event:insert
 * @param {module:engine/model/model~Model} model Model instance.
 * @returns {Function} Returns a conversion callback.
 */
export function modelViewInsertion( model ) {
	return ( evt, data, conversionApi ) => {
		const consumable = conversionApi.consumable;

		if ( !consumable.test( data.item, 'insert' ) ||
			!consumable.test( data.item, 'attribute:listType' ) ||
			!consumable.test( data.item, 'attribute:listIndent' )
		) {
			return;
		}

		if ( data.item.getAttribute( 'listType' ) != 'todo' ) {
			return;
		}

		consumable.consume( data.item, 'insert' );
		consumable.consume( data.item, 'attribute:listType' );
		consumable.consume( data.item, 'attribute:listIndent' );
		consumable.consume( data.item, 'attribute:todoListChecked' );

		const viewWriter = conversionApi.writer;
		const modelItem = data.item;
		const viewItem = generateLiInUl( modelItem, conversionApi );

		addTodoElementsToListItem( modelItem, viewItem, viewWriter, model );
		injectViewList( modelItem, viewItem, conversionApi, model );
	};
}

/**
 * A model-to-view converter for model `$text` element inside a todo list item.
 *
 * It takes care of creating text after the {@link module:engine/view/uielement~UIElement checkbox UI element}.
 *
 * It is used by {@link module:engine/controller/editingcontroller~EditingController}.
 *
 * @see module:engine/conversion/downcastdispatcher~DowncastDispatcher#event:insert
 * @param {module:utils/eventinfo~EventInfo} evt An object containing information about the fired event.
 * @param {Object} data Additional information about the change.
 * @param {module:engine/conversion/downcastdispatcher~DowncastConversionApi} conversionApi Conversion interface.
 */
export function modelViewTextInsertion( evt, data, conversionApi ) {
	const parent = data.range.start.parent;

	if ( parent.name != 'listItem' || parent.getAttribute( 'listType' ) != 'todo' ) {
		return;
	}

	if ( !conversionApi.consumable.consume( data.item, 'insert' ) ) {
		return;
	}

	const viewWriter = conversionApi.writer;
	const viewPosition = conversionApi.mapper.toViewPosition( data.range.start );
	const viewText = viewWriter.createText( data.item.data );

	// Be sure text is created after the UIElement, so if it is a first text node inside a `listItem` element
	// it has to be moved after the first node in the view list item.
	//
	// model: <listItem listtype="todo">[foo]</listItem>
	// view: <li>^<checkbox/></li> -> <li><checkbox/>foo</li>
	viewWriter.insert( viewPosition.offset ? viewPosition : viewPosition.getShiftedBy( 1 ), viewText );
}

/**
 * A model-to-view converter for `listItem` model element insertion.
 *
 * It is used by {@link module:engine/controller/datacontroller~DataController}.
 *
 * @see module:engine/conversion/downcastdispatcher~DowncastDispatcher#event:insert
 * @param {module:engine/model/model~Model} model Model instance.
 * @returns {Function} Returns a conversion callback.
 */
export function dataModelViewInsertion( model ) {
	return ( evt, data, conversionApi ) => {
		const consumable = conversionApi.consumable;

		if ( !consumable.test( data.item, 'insert' ) ||
			!consumable.test( data.item, 'attribute:listType' ) ||
			!consumable.test( data.item, 'attribute:listIndent' )
		) {
			return;
		}

		if ( data.item.getAttribute( 'listType' ) != 'todo' ) {
			return;
		}

		consumable.consume( data.item, 'insert' );
		consumable.consume( data.item, 'attribute:listType' );
		consumable.consume( data.item, 'attribute:listIndent' );

		const viewWriter = conversionApi.writer;
		const modelItem = data.item;
		const viewItem = generateLiInUl( modelItem, conversionApi );

		viewWriter.addClass( 'todo-list', viewItem.parent );

		const label = viewWriter.createAttributeElement( 'label' );
		const checkbox = viewWriter.createEmptyElement( 'input', {
			type: 'checkbox',
			disabled: 'disabled',
			class: 'todo-list__checkmark'
		} );

		if ( data.item.getAttribute( 'todoListChecked' ) ) {
			viewWriter.setAttribute( 'checked', 'checked', checkbox );
		}

		viewWriter.insert( viewWriter.createPositionAt( viewItem, 0 ), checkbox );
		viewWriter.wrap( viewWriter.createRangeOn( checkbox ), label );

		injectViewList( modelItem, viewItem, conversionApi, model );
	};
}

/**
 * A model-to-view converter for model `$text` element inside a todo list item.
 *
 * It is used by {@link module:engine/controller/datacontroller~DataController}.
 *
 * @see module:engine/conversion/downcastdispatcher~DowncastDispatcher#event:insert
 * @param {module:utils/eventinfo~EventInfo} evt An object containing information about the fired event.
 * @param {Object} data Additional information about the change.
 * @param {module:engine/conversion/downcastdispatcher~DowncastConversionApi} conversionApi Conversion interface.
 */
export function dataModelViewTextInsertion( evt, data, conversionApi ) {
	const parent = data.range.start.parent;

	if ( parent.name != 'listItem' || parent.getAttribute( 'listType' ) != 'todo' ) {
		return;
	}

	if ( !conversionApi.consumable.consume( data.item, 'insert' ) ) {
		return;
	}

	const viewWriter = conversionApi.writer;
	const viewPosition = conversionApi.mapper.toViewPosition( data.range.start );
	const viewText = viewWriter.createText( data.item.data );
	const span = viewWriter.createAttributeElement( 'span', { class: 'todo-list__label' } );
	const label = viewWriter.createAttributeElement( 'label' );

	viewWriter.insert( viewWriter.createPositionAt( viewPosition.parent, 'end' ), viewText );
	viewWriter.wrap( viewWriter.createRangeOn( viewText ), span );
	viewWriter.wrap( viewWriter.createRangeOn( viewText.parent ), label );
}

/**
 * A view-to-model converter for checkbox element inside a view list item.
 *
 * It changes `listType` of model `listItem` to a `todo` value.
 * When view checkbox is marked as checked the additional `todoListChecked="true"` attribute is added to model item.
 *
 * It is used by {@link module:engine/controller/datacontroller~DataController}.
 *
 * @see module:engine/conversion/upcastdispatcher~UpcastDispatcher#event:element
 * @param {module:utils/eventinfo~EventInfo} evt An object containing information about the fired event.
 * @param {Object} data An object containing conversion input and a placeholder for conversion output and possibly other values.
 * @param {module:engine/conversion/upcastdispatcher~UpcastConversionApi} conversionApi Conversion interface to be used by the callback.
 */
export function dataViewModelCheckmarkInsertion( evt, data, conversionApi ) {
	const modelCursor = data.modelCursor;
	const modelItem = modelCursor.parent;
	const viewItem = data.viewItem;

	if ( viewItem.getAttribute( 'type' ) != 'checkbox' || modelItem.name != 'listItem' || !modelCursor.isAtStart ) {
		return;
	}

	if ( !conversionApi.consumable.consume( viewItem, { name: true } ) ) {
		return;
	}

	const writer = conversionApi.writer;

	writer.setAttribute( 'listType', 'todo', modelItem );

	if ( data.viewItem.getAttribute( 'checked' ) == 'checked' ) {
		writer.setAttribute( 'todoListChecked', true, modelItem );
	}

	data.modelRange = writer.createRange( modelCursor );
}

/**
 * A model-to-view converter for `listType` attribute change on `listItem` model element.
 *
 * This change means that `<li>` elements parent changes to `<ul class="todo-list">` and
 * {@link module:engine/view/uielement~UIElement checkbox UI element} is added at the beginning of the list item element.
 *
 * This converter is preceded by {@link module:list/converters~modelViewChangeType} and followed by
 * {@link module:list/converters~modelViewMergeAfterChangeType} to handle splitting and merging surrounding lists of the same type.
 *
 * It is used by {@link module:engine/controller/editingcontroller~EditingController}.
 *
 * @see module:engine/conversion/downcastdispatcher~DowncastDispatcher#event:attribute
 * @param {module:engine/model/model~Model} model Model instance.
 * @returns {Function} Returns a conversion callback.
 */
export function modelViewChangeType( model ) {
	return ( evt, data, conversionApi ) => {
		const viewItem = conversionApi.mapper.toViewElement( data.item );
		const viewWriter = conversionApi.writer;

		// Add or remove checkbox for toto list.
		if ( data.attributeNewValue == 'todo' ) {
			addTodoElementsToListItem( data.item, viewItem, viewWriter, model );
		} else if ( data.attributeOldValue == 'todo' ) {
			removeTodoElementsFromListItem( data.item, viewItem, viewWriter, model );
		}
	};
}

/**
 * A model-to-view converter for `todoListChecked` attribute change on `listItem` model element.
 *
 * It marks {@link module:engine/view/uielement~UIElement checkbox UI element} as checked.
 *
 * It is used by {@link module:engine/controller/editingcontroller~EditingController}.
 *
 * @see module:engine/conversion/downcastdispatcher~DowncastDispatcher#event:attribute
 * @param {module:engine/model/model~Model} model Model instance.
 * @returns {Function} Returns a conversion callback.
 */
export function modelViewChangeChecked( model ) {
	return ( evt, data, conversionApi ) => {
		if ( !conversionApi.consumable.consume( data.item, 'attribute:todoListChecked' ) ) {
			return;
		}

		const { mapper, writer: viewWriter } = conversionApi;
		const isChecked = !!data.item.getAttribute( 'todoListChecked' );
		const viewItem = mapper.toViewElement( data.item );
		const itemRange = viewWriter.createRangeIn( viewItem );
		const oldCheckmarkElement = findInRange( itemRange, item => item.is( 'uiElement' ) ? item : false );
		const newCheckmarkElement = createCheckmarkElement( data.item, viewWriter, isChecked, model );

		viewWriter.insert( viewWriter.createPositionAfter( oldCheckmarkElement ), newCheckmarkElement );
		viewWriter.remove( oldCheckmarkElement );
	};
}

// Injects checkbox element inside a view list item and adds `todo-list` class to the parent list element.
//
// @private
// @param {module:engine/model/item~Item} modelItem
// @param {module:engine/view/item~Item} ViewItem
// @param {module:engine/view/downcastwriter~DowncastWriter} viewWriter
// @param {module:engine/model/model~Model} model
function addTodoElementsToListItem( modelItem, viewItem, viewWriter, model ) {
	const isChecked = !!modelItem.getAttribute( 'todoListChecked' );
	const checkmarkElement = createCheckmarkElement( modelItem, viewWriter, isChecked, model );

	viewWriter.addClass( 'todo-list', viewItem.parent );
	viewWriter.insert( viewWriter.createPositionAt( viewItem, 0 ), checkmarkElement );
}

// Removes checkbox element from a view list item and removes `todo-list` class from the parent list element.
//
// @private
// @param {module:engine/model/item~Item} modelItem
// @param {module:engine/view/item~Item} ViewItem
// @param {module:engine/view/downcastwriter~DowncastWriter} viewWriter
// @param {module:engine/model/model~Model} model
function removeTodoElementsFromListItem( modelItem, viewItem, viewWriter, model ) {
	viewWriter.removeClass( 'todo-list', viewItem.parent );
	viewWriter.remove( viewItem.getChild( 0 ) );
	model.change( writer => writer.removeAttribute( 'todoListChecked', modelItem ) );
}

// Creates checkbox UI element.
//
// @private
// @param {module:engine/model/item~Item} modelItem
// @param {module:engine/view/downcastwriter~DowncastWriter} viewWriter
// @param {Boolean} isChecked
// @param {module:engine/model/model~Model} model
// @returns {module:view/uielement~UIElement}
function createCheckmarkElement( modelItem, viewWriter, isChecked, model ) {
	const uiElement = viewWriter.createUIElement(
		'label',
		{
			class: 'todo-list__checkmark',
			contenteditable: false
		},
		function( domDocument ) {
			const checkbox = createElement( document, 'input', { type: 'checkbox', } );

			checkbox.checked = isChecked;

			checkbox.addEventListener( 'change', evt => {
				model.change( writer => {
					if ( evt.target.checked ) {
						writer.setAttribute( 'todoListChecked', true, modelItem );
					} else {
						writer.removeAttribute( 'todoListChecked', modelItem );
					}
				} );
			} );

			const domElement = this.toDomElement( domDocument );

			domElement.appendChild( checkbox );

			return domElement;
		}
	);

	if ( isChecked ) {
		viewWriter.addClass( 'todo-list__checkmark_checked', uiElement );
	}

	return uiElement;
}
