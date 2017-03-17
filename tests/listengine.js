/**
 * @license Copyright (c) 2003-2017, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import ListEngine from '../src/listengine';
import ListCommand from '../src/listcommand';

import ModelPosition from '@ckeditor/ckeditor5-engine/src/model/position';
import ViewPosition from '@ckeditor/ckeditor5-engine/src/view/position';

import Paragraph from '@ckeditor/ckeditor5-paragraph/src/paragraph';
import BoldEngine from '@ckeditor/ckeditor5-basic-styles/src/boldengine';
import UndoEngine from '@ckeditor/ckeditor5-undo/src/undoengine';

import VirtualTestEditor from '@ckeditor/ckeditor5-core/tests/_utils/virtualtesteditor';
import { getData as getModelData, setData as setModelData, parse as parseModel } from '@ckeditor/ckeditor5-engine/src/dev-utils/model';
import { getData as getViewData } from '@ckeditor/ckeditor5-engine/src/dev-utils/view';

describe( 'ListEngine', () => {
	let editor, modelDoc, modelRoot, viewDoc, viewRoot;

	beforeEach( () => {
		return VirtualTestEditor.create( {
			plugins: [ BoldEngine, Paragraph, ListEngine, UndoEngine ]
		} )
		.then( newEditor => {
			editor = newEditor;

			modelDoc = editor.document;
			modelRoot = modelDoc.getRoot();

			viewDoc = editor.editing.view;
			viewRoot = viewDoc.getRoot();
		} );
	} );

	it( 'should be loaded', () => {
		expect( editor.plugins.get( ListEngine ) ).to.be.instanceOf( ListEngine );
	} );

	it( 'should set proper schema rules', () => {
		expect( modelDoc.schema.hasItem( 'listItem' ) );
		expect( modelDoc.schema.itemExtends( 'listItem', '$block' ) );

		expect( modelDoc.schema.check( { name: '$inline', inside: 'listItem' } ) ).to.be.true;
		expect( modelDoc.schema.check( { name: 'listItem', inside: 'listItem' } ) ).to.be.false;
		expect( modelDoc.schema.check( { name: '$block', inside: 'listItem' } ) ).to.be.false;

		expect( modelDoc.schema.check( { name: 'listItem', inside: '$root' } ) ).to.be.false;
		expect( modelDoc.schema.check( { name: 'listItem', inside: '$root', attributes: [ 'indent' ] } ) ).to.be.false;
		expect( modelDoc.schema.check( { name: 'listItem', inside: '$root', attributes: [ 'type' ] } ) ).to.be.false;
		expect( modelDoc.schema.check( { name: 'listItem', inside: '$root', attributes: [ 'indent', 'type' ] } ) ).to.be.true;
	} );

	describe( 'commands', () => {
		it( 'should register bulleted list command', () => {
			expect( editor.commands.has( 'bulletedList' ) ).to.be.true;

			const command = editor.commands.get( 'bulletedList' );

			expect( command ).to.be.instanceOf( ListCommand );
			expect( command ).to.have.property( 'type', 'bulleted' );
		} );

		it( 'should register numbered list command', () => {
			expect( editor.commands.has( 'numberedList' ) ).to.be.true;

			const command = editor.commands.get( 'numberedList' );

			expect( command ).to.be.instanceOf( ListCommand );
			expect( command ).to.have.property( 'type', 'numbered' );
		} );
	} );

	describe( 'flat lists', () => {
		describe( 'setting data', () => {
			function test( testName, string, expectedString = null ) {
				it( testName, () => {
					editor.setData( string );
					expect( editor.getData() ).to.equal( expectedString || string );
				} );
			}

			test( 'single item', '<ul><li>x</li></ul>' );
			test( 'multiple items', '<ul><li>a</li><li>b</li><li>c</li></ul>' );
			test( 'items and text', '<p>xxx</p><ul><li>a</li><li>b</li></ul><p>yyy</p><ul><li>c</li><li>d</li></ul>' );
			test( 'numbered list', '<ol><li>a</li><li>b</li></ol>' );
			test( 'mixed list and content #1', '<p>xxx</p><ul><li>a</li><li>b</li></ul><ol><li>c</li><li>d</li></ol><p>yyy</p>' );
			test( 'mixed list and content #2', '<ol><li>a</li></ol><p>xxx</p><ul><li>b</li><li>c</li></ul><p>yyy</p><ul><li>d</li></ul>' );
			test( 'clears incorrect elements', '<ul>x<li>a</li><li>b</li><p>xxx</p>x</ul><p>c</p>', '<ul><li>a</li><li>b</li></ul><p>c</p>' );
			test(
				'clears whitespaces',
				'<p>foo</p>' +
				'<ul>' +
				'	<li>xxx</li>' +
				'	<li>yyy</li>' +
				'</ul>',
				'<p>foo</p><ul><li>xxx</li><li>yyy</li></ul>'
			);

			it( 'model test for mixed content', () => {
				editor.setData( '<ol><li>a</li></ol><p>xxx</p><ul><li>b</li><li>c</li></ul><p>yyy</p><ul><li>d</li></ul>' );

				const expectedModelData =
					'<listItem indent="0" type="numbered">a</listItem>' +
					'<paragraph>xxx</paragraph>' +
					'<listItem indent="0" type="bulleted">b</listItem>' +
					'<listItem indent="0" type="bulleted">c</listItem>' +
					'<paragraph>yyy</paragraph>' +
					'<listItem indent="0" type="bulleted">d</listItem>';

				expect( getModelData( modelDoc, { withoutSelection: true } ) ).to.equal( expectedModelData );
			} );
		} );

		describe( 'position mapping', () => {
			let mapper;

			beforeEach( () => {
				mapper = editor.editing.mapper;

				editor.setData(
					'<p>a</p>' +
					'<ul>' +
						'<li>b</li>' +
						'<li>c</li>' +
						'<li>d</li>' +
					'</ul>' +
					'<p>e</p>' +
					'<ol>' +
						'<li>f</li>' +
					'</ol>' +
					'<p>g</p>'
				);
			} );

			/*
				<paragraph>a</paragraph>
				<listItem indent=0 type="bulleted">b</listItem>
				<listItem indent=0 type="bulleted">c</listItem>
				<listItem indent=0 type="bulleted">d</listItem>
				<paragraph>e</paragraph>
				<listItem indent=0 type="numbered">f</listItem>
				<paragraph>g</paragraph>
			 */

			describe( 'view to model', () => {
				function test( testName, viewPath, modelPath ) {
					it( testName, () => {
						const viewPos = getViewPosition( viewRoot, viewPath );
						const modelPos = mapper.toModelPosition( viewPos );

						expect( modelPos.root ).to.equal( modelRoot );
						expect( modelPos.path ).to.deep.equal( modelPath );
					} );
				}

				test( 'before ul',			[ 1 ],			[ 1 ] );	// --> before first `listItem`
				test( 'before first li',	[ 1, 0 ],		[ 1 ] );	// --> before first `listItem`
				test( 'beginning of li',	[ 1, 0, 0 ],	[ 1, 0 ] );	// --> beginning of first `listItem`
				test( 'end of li',			[ 1, 0, 1 ],	[ 1, 1 ] );	// --> end of first `listItem`
				test( 'before middle li',	[ 1, 1 ],		[ 2 ] );	// --> before middle `listItem`
				test( 'before last li',		[ 1, 2 ],		[ 3 ] );	// --> before last `listItem`
				test( 'after last li',		[ 1, 3 ],		[ 4 ] );	// --> after last `listItem` / before `paragraph`
				test( 'after ul',			[ 2 ],			[ 4 ] );	// --> after last `listItem` / before `paragraph`
				test( 'before ol',			[ 3 ],			[ 5 ] );	// --> before numbered `listItem`
				test( 'before only li',		[ 3, 0 ],		[ 5 ] );	// --> before numbered `listItem`
				test( 'after only li',		[ 3, 1 ],		[ 6 ] );	// --> after numbered `listItem`
				test( 'after ol',			[ 4 ],			[ 6 ] );	// --> after numbered `listItem`
			} );

			describe( 'model to view', () => {
				function test( testName, modelPath, viewPath ) {
					it( testName, () => {
						const modelPos = new ModelPosition( modelRoot, modelPath );
						const viewPos = mapper.toViewPosition( modelPos );

						expect( viewPos.root ).to.equal( viewRoot );
						expect( getViewPath( viewPos ) ).to.deep.equal( viewPath );
					} );
				}

				test( 'before first listItem',			[ 1 ],		[ 1 ] );			// --> before ul
				test( 'beginning of first listItem',	[ 1, 0 ],	[ 1, 0, 0, 0 ] );	// --> beginning of `b` text node
				test( 'end of first listItem',			[ 1, 1 ],	[ 1, 0, 0, 1 ] );	// --> end of `b` text node
				test( 'before middle listItem',			[ 2 ],		[ 1, 1 ] );			// --> before middle li
				test( 'before last listItem',			[ 3 ],		[ 1, 2 ] );			// --> before last li
				test( 'after last listItem',			[ 4 ],		[ 2 ] );			// --> after ul
				test( 'before numbered listItem',		[ 5 ],		[ 3 ] );			// --> before ol
				test( 'after numbered listItem',		[ 6 ],		[ 4 ] );			// --> after ol
			} );
		} );

		describe( 'convert changes', () => {
			describe( 'insert', () => {
				testInsert(
					'list item at the beginning of same list type',

					'<paragraph>p</paragraph>' +
					'[<listItem indent="0" type="bulleted">x</listItem>]' +
					'<listItem indent="0" type="bulleted">a</listItem>',

					'<p>p</p>' +
					'<ul>' +
						'<li>x</li>' +
						'<li>a</li>' +
					'</ul>'
				);

				testInsert(
					'list item in the middle of same list type',

					'<paragraph>p</paragraph>' +
					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<listItem indent="0" type="bulleted">x</listItem>]' +
					'<listItem indent="0" type="bulleted">b</listItem>',

					'<p>p</p>' +
					'<ul>' +
						'<li>a</li>' +
						'<li>x</li>' +
						'<li>b</li>' +
					'</ul>'
				);

				testInsert(
					'list item at the end of same list type',

					'<paragraph>p</paragraph>' +
					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<listItem indent="0" type="bulleted">x</listItem>]',

					'<p>p</p>' +
					'<ul>' +
						'<li>a</li>' +
						'<li>x</li>' +
					'</ul>'
				);

				testInsert(
					'list item at the beginning of different list type',

					'<paragraph>p</paragraph>' +
					'[<listItem indent="0" type="numbered">x</listItem>]' +
					'<listItem indent="0" type="bulleted">a</listItem>',

					'<p>p</p>' +
					'<ol>' +
						'<li>x</li>' +
					'</ol>' +
					'<ul>' +
						'<li>a</li>' +
					'</ul>'
				);

				testInsert(
					'list item in the middle of different list type',

					'<paragraph>p</paragraph>' +
					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<listItem indent="0" type="numbered">x</listItem>]' +
					'<listItem indent="0" type="bulleted">b</listItem>',

					'<p>p</p>' +
					'<ul>' +
						'<li>a</li>' +
					'</ul>' +
					'<ol>' +
						'<li>x</li>' +
					'</ol>' +
					'<ul>' +
						'<li>b</li>' +
					'</ul>'
				);

				testInsert(
					'list item at the end of different list type',

					'<paragraph>p</paragraph>' +
					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<listItem indent="0" type="numbered">x</listItem>]',

					'<p>p</p>' +
					'<ul>' +
						'<li>a</li>' +
					'</ul>' +
					'<ol>' +
						'<li>x</li>' +
					'</ol>'
				);

				testInsert(
					'element between list items',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<paragraph>x</paragraph>]' +
					'<listItem indent="0" type="bulleted">a</listItem>',

					'<ul>' +
						'<li>a</li>' +
					'</ul>' +
					'<p>x</p>' +
					'<ul>' +
						'<li>a</li>' +
					'</ul>'
				);
			} );

			describe( 'remove', () => {
				testRemove(
					'remove the first list item',

					'<paragraph>p</paragraph>' +
					'[<listItem indent="0" type="bulleted">a</listItem>]' +
					'<listItem indent="0" type="bulleted">b</listItem>' +
					'<listItem indent="0" type="bulleted">c</listItem>',

					'<p>p</p>' +
					'<ul>' +
						'<li>b</li>' +
						'<li>c</li>' +
					'</ul>'
				);

				testRemove(
					'remove list item from the middle',

					'<paragraph>p</paragraph>' +
					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<listItem indent="0" type="bulleted">b</listItem>]' +
					'<listItem indent="0" type="bulleted">c</listItem>',

					'<p>p</p>' +
					'<ul>' +
						'<li>a</li>' +
						'<li>c</li>' +
					'</ul>'
				);

				testRemove(
					'remove the last list item',

					'<paragraph>p</paragraph>' +
					'<listItem indent="0" type="bulleted">a</listItem>' +
					'<listItem indent="0" type="bulleted">b</listItem>' +
					'[<listItem indent="0" type="bulleted">c</listItem>]',

					'<p>p</p>' +
					'<ul>' +
						'<li>a</li>' +
						'<li>b</li>' +
					'</ul>'
				);

				testRemove(
					'remove the only list item',

					'<paragraph>p</paragraph>' +
					'[<listItem indent="0" type="bulleted">x</listItem>]' +
					'<paragraph>p</paragraph>',

					'<p>p</p>' +
					'<p>p</p>'
				);

				testRemove(
					'remove element from between lists of same type',

					'<paragraph>p</paragraph>' +
					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<paragraph>x</paragraph>]' +
					'<listItem indent="0" type="bulleted">b</listItem>' +
					'<paragraph>p</paragraph>',

					'<p>p</p>' +
					'<ul>' +
						'<li>a</li>' +
						'<li>b</li>' +
					'</ul>' +
					'<p>p</p>'
				);

				testRemove(
					'remove element from between lists of different type',

					'<paragraph>p</paragraph>' +
					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<paragraph>x</paragraph>]' +
					'<listItem indent="0" type="numbered">b</listItem>' +
					'<paragraph>p</paragraph>',

					'<p>p</p>' +
					'<ul>' +
						'<li>a</li>' +
					'</ul>' +
					'<ol>' +
						'<li>b</li>' +
					'</ol>' +
					'<p>p</p>'
				);
			} );

			describe( 'change type', () => {
				testChangeType(
					'change first list item',

					'<paragraph>p</paragraph>' +
					'[<listItem indent="0" type="bulleted">a</listItem>]' +
					'<listItem indent="0" type="bulleted">b</listItem>' +
					'<listItem indent="0" type="bulleted">c</listItem>',

					'<p>p</p>' +
					'<ol>' +
						'<li>a</li>' +
					'</ol>' +
					'<ul>' +
						'<li>b</li>' +
						'<li>c</li>' +
					'</ul>'
				);

				testChangeType(
					'change middle list item',

					'<paragraph>p</paragraph>' +
					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<listItem indent="0" type="bulleted">b</listItem>]' +
					'<listItem indent="0" type="bulleted">c</listItem>',

					'<p>p</p>' +
					'<ul>' +
						'<li>a</li>' +
					'</ul>' +
					'<ol>' +
						'<li>b</li>' +
					'</ol>' +
					'<ul>' +
						'<li>c</li>' +
					'</ul>'
				);

				testChangeType(
					'change last list item',

					'<paragraph>p</paragraph>' +
					'<listItem indent="0" type="bulleted">a</listItem>' +
					'<listItem indent="0" type="bulleted">b</listItem>' +
					'[<listItem indent="0" type="bulleted">c</listItem>]',

					'<p>p</p>' +
					'<ul>' +
						'<li>a</li>' +
						'<li>b</li>' +
					'</ul>' +
					'<ol>' +
						'<li>c</li>' +
					'</ol>'
				);

				testChangeType(
					'change only list item',

					'<paragraph>p</paragraph>' +
					'[<listItem indent="0" type="bulleted">a</listItem>]' +
					'<paragraph>p</paragraph>',

					'<p>p</p>' +
					'<ol>' +
						'<li>a</li>' +
					'</ol>' +
					'<p>p</p>'
				);

				testChangeType(
					'change element at the edge of two different lists #1',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'<listItem indent="0" type="bulleted">b</listItem>' +
					'[<listItem indent="0" type="bulleted">c</listItem>]' +
					'<listItem indent="0" type="numbered">d</listItem>',

					'<ul>' +
						'<li>a</li>' +
						'<li>b</li>' +
					'</ul>' +
					'<ol>' +
						'<li>c</li>' +
						'<li>d</li>' +
					'</ol>'
				);

				testChangeType(
					'change element at the edge of two different lists #1',

					'<listItem indent="0" type="numbered">a</listItem>' +
					'[<listItem indent="0" type="bulleted">b</listItem>]' +
					'<listItem indent="0" type="bulleted">c</listItem>' +
					'<listItem indent="0" type="bulleted">d</listItem>',

					'<ol>' +
						'<li>a</li>' +
						'<li>b</li>' +
					'</ol>' +
					'<ul>' +
						'<li>c</li>' +
						'<li>d</li>' +
					'</ul>'
				);

				testChangeType(
					'change multiple elements #1',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<listItem indent="0" type="bulleted">b</listItem>' +
					'<listItem indent="0" type="bulleted">c</listItem>]' +
					'<listItem indent="0" type="bulleted">d</listItem>',

					'<ul>' +
						'<li>a</li>' +
					'</ul>' +
					'<ol>' +
						'<li>b</li>' +
						'<li>c</li>' +
					'</ol>' +
					'<ul>' +
						'<li>d</li>' +
					'</ul>'
				);

				testChangeType(
					'change multiple elements #2',

					'<listItem indent="0" type="numbered">a</listItem>' +
					'[<listItem indent="0" type="bulleted">b</listItem>' +
					'<listItem indent="0" type="bulleted">c</listItem>]' +
					'<listItem indent="0" type="numbered">d</listItem>',

					'<ol>' +
						'<li>a</li>' +
						'<li>b</li>' +
						'<li>c</li>' +
						'<li>d</li>' +
					'</ol>'
				);
			} );

			describe( 'rename from list item', () => {
				testRenameFromListItem(
					'rename first list item',

					'[<listItem indent="0" type="bulleted">a</listItem>]' +
					'<listItem indent="0" type="bulleted">b</listItem>',

					'<p>a</p>' +
					'<ul>' +
						'<li>b</li>' +
					'</ul>'
				);

				testRenameFromListItem(
					'rename middle list item',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<listItem indent="0" type="bulleted">b</listItem>]' +
					'<listItem indent="0" type="bulleted">c</listItem>',

					'<ul>' +
						'<li>a</li>' +
					'</ul>' +
					'<p>b</p>' +
					'<ul>' +
						'<li>c</li>' +
					'</ul>'
				);

				testRenameFromListItem(
					'rename last list item',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<listItem indent="0" type="bulleted">b</listItem>]',

					'<ul>' +
						'<li>a</li>' +
					'</ul>' +
					'<p>b</p>'
				);

				testRenameFromListItem(
					'rename only list item',

					'<paragraph>p</paragraph>' +
					'[<listItem indent="0" type="bulleted">x</listItem>]' +
					'<paragraph>p</paragraph>',

					'<p>p</p>' +
					'<p>x</p>' +
					'<p>p</p>'
				);
			} );

			describe( 'rename to list item (with attribute change)', () => {
				testRenameToListItem(
					'only paragraph', 0,

					'[<paragraph>a</paragraph>]',

					'<ul>' +
						'<li>a</li>' +
					'</ul>'
				);

				testRenameToListItem(
					'paragraph between paragraphs', 0,

					'<paragraph>x</paragraph>' +
					'[<paragraph>a</paragraph>]' +
					'<paragraph>x</paragraph>',

					'<p>x</p>' +
					'<ul>' +
						'<li>a</li>' +
					'</ul>' +
					'<p>x</p>'
				);

				testRenameToListItem(
					'element before list of same type', 0,

					'[<paragraph>x</paragraph>]' +
					'<listItem indent="0" type="bulleted">a</listItem>',

					'<ul>' +
						'<li>x</li>' +
						'<li>a</li>' +
					'</ul>'
				);

				testRenameToListItem(
					'element after list of same type', 0,

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<paragraph>x</paragraph>]',

					'<ul>' +
						'<li>a</li>' +
						'<li>x</li>' +
					'</ul>'
				);

				testRenameToListItem(
					'element before list of different type', 0,

					'[<paragraph>x</paragraph>]' +
					'<listItem indent="0" type="numbered">a</listItem>',

					'<ul>' +
						'<li>x</li>' +
					'</ul>' +
					'<ol>' +
						'<li>a</li>' +
					'</ol>'
				);

				testRenameToListItem(
					'element after list of different type', 0,

					'<listItem indent="0" type="numbered">a</listItem>' +
					'[<paragraph>x</paragraph>]',

					'<ol>' +
						'<li>a</li>' +
					'</ol>' +
					'<ul>' +
						'<li>x</li>' +
					'</ul>'
				);

				testRenameToListItem(
					'element between lists of same type', 0,

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<paragraph>x</paragraph>]' +
					'<listItem indent="0" type="bulleted">b</listItem>',

					'<ul>' +
						'<li>a</li>' +
						'<li>x</li>' +
						'<li>b</li>' +
					'</ul>'
				);
			} );

			describe( 'move', () => {
				testMove(
					'move list item inside same list',

					'<paragraph>p</paragraph>' +
					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<listItem indent="0" type="bulleted">b</listItem>]' +
					'<listItem indent="0" type="bulleted">c</listItem>',

					4, // Move after last item.

					'<p>p</p>' +
					'<ul>' +
						'<li>a</li>' +
						'<li>c</li>' +
						'<li>b</li>' +
					'</ul>'
				);

				testMove(
					'move out list item from list',

					'<paragraph>p</paragraph>' +
					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<listItem indent="0" type="bulleted">b</listItem>]' +
					'<paragraph>p</paragraph>',

					4, // Move after second paragraph.

					'<p>p</p>' +
					'<ul>' +
						'<li>a</li>' +
					'</ul>' +
					'<p>p</p>' +
					'<ul>' +
						'<li>b</li>' +
					'</ul>'
				);

				testMove(
					'move the only list item',

					'<paragraph>p</paragraph>' +
					'[<listItem indent="0" type="bulleted">a</listItem>]' +
					'<paragraph>p</paragraph>',

					3, // Move after second paragraph.

					'<p>p</p>' +
					'<p>p</p>' +
					'<ul>' +
						'<li>a</li>' +
					'</ul>'
				);

				testMove(
					'move list item between two lists of same type',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<listItem indent="0" type="bulleted">b</listItem>]' +
					'<paragraph>p</paragraph>' +
					'<listItem indent="0" type="bulleted">c</listItem>' +
					'<listItem indent="0" type="bulleted">d</listItem>',

					4, // Move between list item "c" and list item "d'.

					'<ul>' +
						'<li>a</li>' +
					'</ul>' +
					'<p>p</p>' +
					'<ul>' +
						'<li>c</li>' +
						'<li>b</li>' +
						'<li>d</li>' +
					'</ul>'
				);

				testMove(
					'move list item between two lists of different type',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<listItem indent="0" type="bulleted">b</listItem>]' +
					'<paragraph>p</paragraph>' +
					'<listItem indent="0" type="numbered">c</listItem>' +
					'<listItem indent="0" type="numbered">d</listItem>',

					4, // Move between list item "c" and list item "d'.

					'<ul>' +
						'<li>a</li>' +
					'</ul>' +
					'<p>p</p>' +
					'<ol>' +
						'<li>c</li>' +
					'</ol>' +
					'<ul>' +
						'<li>b</li>' +
					'</ul>' +
					'<ol>' +
						'<li>d</li>' +
					'</ol>'
				);

				testMove(
					'move element between list items',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'<listItem indent="0" type="bulleted">b</listItem>' +
					'[<paragraph>p</paragraph>]',

					1, // Move between list item "a" and list item "b'.

					'<ul>' +
						'<li>a</li>' +
					'</ul>' +
					'<p>p</p>' +
					'<ul>' +
						'<li>b</li>' +
					'</ul>'
				);
			} );
		} );
	} );

	describe( 'nested lists', () => {
		describe( 'setting data', () => {
			function test( testName, string, expectedString = null ) {
				it( testName, () => {
					editor.setData( string );
					expect( editor.getData() ).to.equal( expectedString || string );
				} );
			}

			test( 'bullet list simple structure',
				'<p>foo</p>' +
				'<ul>' +
					'<li>' +
						'1' +
						'<ul>' +
							'<li>1.1</li>' +
						'</ul>' +
					'</li>' +
				'</ul>' +
				'<p>bar</p>'
			);

			test( 'bullet list deep structure',
				'<p>foo</p>' +
				'<ul>' +
					'<li>' +
						'1' +
						'<ul>' +
							'<li>' +
								'1.1' +
								'<ul><li>1.1.1</li><li>1.1.2</li><li>1.1.3</li><li>1.1.4</li></ul>' +
							'</li>' +
							'<li>' +
								'1.2' +
								'<ul><li>1.2.1</li></ul>' +
							'</li>' +
						'</ul>' +
					'</li>' +
					'<li>2</li>' +
					'<li>' +
						'3' +
						'<ul>' +
							'<li>' +
								'3.1' +
								'<ul>' +
									'<li>' +
										'3.1.1' +
										'<ul><li>3.1.1.1</li></ul>' +
									'</li>' +
									'<li>3.1.2</li>' +
								'</ul>' +
							'</li>' +
						'</ul>' +
					'</li>' +
				'</ul>' +
				'<p>bar</p>'
			);

			test( 'mixed lists deep structure',
				'<p>foo</p>' +
				'<ul>' +
					'<li>' +
						'1' +
						'<ul>' +
							'<li>' +
								'1.1' +
								'<ul><li>1.1.1</li><li>1.1.2</li></ul>' +
								'<ol><li>1.1.3</li><li>1.1.4</li></ol>' +
							'</li>' +
							'<li>' +
								'1.2' +
								'<ul><li>1.2.1</li></ul>' +
							'</li>' +
						'</ul>' +
					'</li>' +
					'<li>2</li>' +
					'<li>' +
						'3' +
						'<ol>' +
							'<li>' +
								'3.1' +
								'<ul>' +
									'<li>' +
										'3.1.1' +
										'<ol><li>3.1.1.1</li></ol>' +
										'<ul><li>3.1.1.2</li></ul>' +
									'</li>' +
									'<li>3.1.2</li>' +
								'</ul>' +
							'</li>' +
						'</ol>' +
						'<ul>' +
							'<li>3.2</li>' +
							'<li>3.3</li>' +
						'</ul>' +
					'</li>' +
				'</ul>' +
				'<p>bar</p>'
			);

			test( 'mixed lists deep structure, white spaces, incorrect content, empty items',
				'<p>foo</p>' +
				'<ul>' +
				'	xxx' +
				'	<li>' +
				'		1' +
				'		<ul>' +
				'			xxx' +
				'			<li>' +
				'				<ul><li></li><li>1.1.2</li></ul>' +
				'				<ol><li>1.1.3</li><li>1.1.4</li></ol>' +
				'			</li>' +
				'			<li>' +
				'				<ul><li>1.2.1</li></ul>' +
				'			</li>' +
				'			xxx' +
				'		</ul>' +
				'	</li>' +
				'	<li>2</li>' +
				'	<li>' +
				'		<ol>' +
				'			<p>xxx</p>' +
				'			<li>' +
				'				3<strong>.</strong>1' +							// Test multiple text nodes in <li>.
				'				<ul>' +
				'					<li>' +
				'						3.1.1' +
				'						<ol><li>3.1.1.1</li></ol>' +
				'						<ul><li>3.1.1.2</li></ul>' +
				'					</li>' +
				'					<li>3.1.2</li>' +
				'				</ul>' +
				'			</li>' +
				'		</ol>' +
				'		<p>xxx</p>' +
				'		<ul>' +
				'			<li>3.2</li>' +
				'			<li>3.3</li>' +
				'		</ul>' +
				'	</li>' +
				'	<p>xxx</p>' +
				'</ul>' +
				'<p>bar</p>',
				'<p>foo</p>' +
				'<ul>' +
					'<li>' +
						'1' +
						'<ul>' +
							'<li>' +
								'&nbsp;' +
								'<ul><li>&nbsp;</li><li>1.1.2</li></ul>' +
								'<ol><li>1.1.3</li><li>1.1.4</li></ol>' +
							'</li>' +
							'<li>' +
								'&nbsp;' +
								'<ul><li>1.2.1</li></ul>' +
							'</li>' +
						'</ul>' +
					'</li>' +
					'<li>2</li>' +
					'<li>' +
						'&nbsp;' +
						'<ol>' +
							'<li>' +
								'3<strong>.</strong>1' +
								'<ul>' +
									'<li>' +
										'3.1.1' +
										'<ol><li>3.1.1.1</li></ol>' +
										'<ul><li>3.1.1.2</li></ul>' +
									'</li>' +
									'<li>3.1.2</li>' +
								'</ul>' +
							'</li>' +
						'</ol>' +
						'<ul>' +
							'<li>3.2</li>' +
							'<li>3.3</li>' +
						'</ul>' +
					'</li>' +
				'</ul>' +
				'<p>bar</p>'
			);

			it( 'model test for nested lists', () => {
				editor.setData(
					'<p>foo</p>' +
					'<ul>' +
						'<li>' +
							'1' +
							'<ul>' +
								'<li>1.1</li>' +
							'</ul>' +
							'<ol>' +
								'<li>' +
									'1.2' +
									'<ul>' +
										'<li>1.2.1</li>' +
									'</ul>' +
								'</li>' +
								'<li>1.3</li>' +
							'</ol>' +
						'</li>' +
						'<li>2</li>' +
					'</ul>' +
					'<p>bar</p>'
				);

				const expectedModelData =
					'<paragraph>foo</paragraph>' +
					'<listItem indent="0" type="bulleted">1</listItem>' +
					'<listItem indent="1" type="bulleted">1.1</listItem>' +
					'<listItem indent="1" type="numbered">1.2</listItem>' +
					'<listItem indent="2" type="bulleted">1.2.1</listItem>' +
					'<listItem indent="1" type="numbered">1.3</listItem>' +
					'<listItem indent="0" type="bulleted">2</listItem>' +
					'<paragraph>bar</paragraph>';

				expect( getModelData( modelDoc, { withoutSelection: true } ) ).to.equal( expectedModelData );
			} );
		} );

		describe( 'position mapping', () => {
			let mapper;

			beforeEach( () => {
				mapper = editor.editing.mapper;

				editor.setData(
					'<ul>' +
						'<li>a</li>' +
						'<li>' +
							'b' +
							'<ol>' +
								'<li>c</li>' +
								'<li>' +
									'd' +
									'<ul>' +
										'<li>e</li>' +
									'</ul>' +
									'<ol>' +
										'<li>f</li>' +
									'</ol>' +
								'</li>' +
								'<li>g</li>' +
							'</ol>' +
						'</li>' +
						'<li>h</li>' +
					'</ul>'
				);
			} );

			/*
				<listItem indent=0 type="bulleted">a</listItem>
				<listItem indent=0 type="bulleted">b</listItem>
				<listItem indent=1 type="numbered">c</listItem>
				<listItem indent=1 type="numbered">d</listItem>
				<listItem indent=2 type="bulleted">e</listItem>
				<listItem indent=2 type="numbered">f</listItem>
				<listItem indent=1 type="numbered">g</listItem>
				<listItem indent=0 type="bulleted">h</listItem>
			 */

			describe( 'view to model', () => {
				function test( testName, viewPath, modelPath ) {
					it( testName, () => {
						const viewPos = getViewPosition( viewRoot, viewPath );
						const modelPos = mapper.toModelPosition( viewPos );

						expect( modelPos.root ).to.equal( modelRoot );
						expect( modelPos.path ).to.deep.equal( modelPath );
					} );
				}

				test( 'before ul',			[ 0 ],					[ 0 ] );	// --> before listItem "a"
				test( 'before li "a"',		[ 0, 0 ],				[ 0 ] );	// --> before listItem "a"
				test( 'before "a"',			[ 0, 0, 0 ],			[ 0, 0 ] );	// --> beginning of listItem "a"
				test( 'after "a"',			[ 0, 0, 1 ],			[ 0, 1 ] );	// --> end of listItem "a"
				test( 'before li "b"',		[ 0, 1 ],				[ 1 ] );	// --> before listItem "b"
				test( 'before "b"',			[ 0, 1, 0 ],			[ 1, 0 ] );	// --> beginning of listItem "b"
				test( 'after "b"',			[ 0, 1, 1 ],			[ 1, 1 ] );	// --> end of listItem "b"
				test( 'before li "c"',		[ 0, 1, 1, 0 ],			[ 2 ] );	// --> before listItem "c"
				test( 'before "c"',			[ 0, 1, 1, 0, 0 ],		[ 2, 0 ] );	// --> beginning of listItem "c"
				test( 'after "c"',			[ 0, 1, 1, 0, 1 ],		[ 2, 1 ] );	// --> end of listItem "c"
				test( 'before li "d"',		[ 0, 1, 1, 1 ],			[ 3 ] );	// --> before listItem "d"
				test( 'before "d"',			[ 0, 1, 1, 1, 0 ],		[ 3, 0 ] );	// --> beginning of listItem "d"
				test( 'after "d"',			[ 0, 1, 1, 1, 1 ],		[ 3, 1 ] );	// --> end of listItem "d"
				test( 'before li "e"',		[ 0, 1, 1, 1, 1, 0 ],	[ 4 ] );	// --> before listItem "e"
				test( 'after li "e"',		[ 0, 1, 1, 1, 1, 1 ],	[ 5 ] );	// --> before listItem "f"
				test( 'between ul and ol',	[ 0, 1, 1, 1, 2 ],		[ 5 ] );	// --> before listItem "f"
				test( 'before li "f"',		[ 0, 1, 1, 1, 2, 0 ],	[ 5 ] );	// --> before listItem "f"
				test( 'after li "f"',		[ 0, 1, 1, 1, 2, 1 ],	[ 6 ] );	// --> before listItem "g"
				test( 'end of li "d"',		[ 0, 1, 1, 1, 3 ],		[ 6 ] );	// --> before listItem "g"
				test( 'before li "g"',		[ 0, 1, 1, 2 ],			[ 6 ] );	// --> before listItem "g"
				test( 'after li "g"',		[ 0, 1, 1, 3 ],			[ 7 ] );	// --> before listItem "h"
				test( 'end of li "b"',		[ 0, 1, 2 ],			[ 7 ] );	// --> before listItem "h"
				test( 'before li "h"',		[ 0, 2 ],				[ 7 ] );	// --> before listItem "h"
				test( 'after li "h"',		[ 0, 3 ],				[ 8 ] );	// --> after listItem "h"
				test( 'after ul',			[ 1 ],					[ 8 ] );	// --> after listItem "h"
			} );

			describe( 'model to view', () => {
				function test( testName, modelPath, viewPath ) {
					it( testName, () => {
						const modelPos = new ModelPosition( modelRoot, modelPath );
						const viewPos = mapper.toViewPosition( modelPos );

						expect( viewPos.root ).to.equal( viewRoot );
						expect( getViewPath( viewPos ) ).to.deep.equal( viewPath );
					} );
				}

				test( 'before listItem "a"',		[ 0 ],		[ 0 ] );				// --> before ul
				test( 'beginning of listItem "a"',	[ 0, 0 ],	[ 0, 0, 0, 0 ] );		// --> before "a", in text node
				test( 'end of listItem "a"',		[ 0, 1 ],	[ 0, 0, 0, 1 ] );		// --> after "a", in text node
				test( 'before listItem "b"',		[ 1 ],		[ 0, 1 ] );				// --> before li "b"
				test( 'beginning of listItem "b"',	[ 1, 0 ],	[ 0, 1, 0, 0 ] );		// --> before "b", in text node
				test( 'end of listItem "b"',		[ 1, 1 ],	[ 0, 1, 0, 1 ] );		// --> after "b", in text node
				test( 'before listItem "c"',		[ 2 ],		[ 0, 1, 1, 0 ] );		// --> before li "c"
				test( 'beginning of listItem "c"',	[ 2, 0 ],	[ 0, 1, 1, 0, 0, 0 ] );	// --> before "c", in text node
				test( 'end of listItem "c"',		[ 2, 1 ],	[ 0, 1, 1, 0, 0, 1 ] );	// --> after "c", in text node
				test( 'before listItem "d"',		[ 3 ],		[ 0, 1, 1, 1 ] );		// --> before li "d"
				test( 'beginning of listItem "d"',	[ 3, 0 ],	[ 0, 1, 1, 1, 0, 0 ] );	// --> before "d", in text node
				test( 'end of listItem "d"',		[ 3, 1 ],	[ 0, 1, 1, 1, 0, 1 ] );	// --> after "d", in text node
				test( 'before listItem "e"',		[ 4 ],		[ 0, 1, 1, 1, 1, 0 ] ); // --> before li "e"
				test( 'before listItem "f"',		[ 5 ],		[ 0, 1, 1, 1, 2, 0 ] ); // --> before li "f"
				test( 'before listItem "g"',		[ 6 ],		[ 0, 1, 1, 2 ] );		// --> before li "g"
				test( 'before listItem "h"',		[ 7 ],		[ 0, 2 ] );				// --> before li "h"
				test( 'after listItem "h"',			[ 8 ],		[ 1 ] );				// --> after ul
			} );
		} );

		describe( 'convert changes', () => {
			describe( 'insert', () => {
				describe( 'same list type', () => {
					testInsert(
						'after smaller indent',

						'<paragraph>p</paragraph>' +
						'<listItem indent="0" type="bulleted">1</listItem>' +
						'[<listItem indent="1" type="bulleted">x</listItem>]',

						'<p>p</p>' +
						'<ul>' +
							'<li>' +
								'1' +
								'<ul>' +
									'<li>x</li>' +
								'</ul>' +
							'</li>' +
						'</ul>'
					);

					testInsert(
						'after smaller indent, before same indent',

						'<paragraph>p</paragraph>' +
						'<listItem indent="0" type="bulleted">1</listItem>' +
						'[<listItem indent="1" type="bulleted">x</listItem>]' +
						'<listItem indent="1" type="bulleted">1.1</listItem>',

						'<p>p</p>' +
						'<ul>' +
							'<li>' +
								'1' +
								'<ul>' +
									'<li>x</li>' +
									'<li>1.1</li>' +
								'</ul>' +
							'</li>' +
						'</ul>'
					);

					testInsert(
						'after smaller indent, before smaller indent',

						'<paragraph>p</paragraph>' +
						'<listItem indent="0" type="bulleted">1</listItem>' +
						'[<listItem indent="1" type="bulleted">x</listItem>]' +
						'<listItem indent="0" type="bulleted">2</listItem>',

						'<p>p</p>' +
						'<ul>' +
							'<li>' +
								'1' +
								'<ul>' +
									'<li>x</li>' +
								'</ul>' +
							'</li>' +
							'<li>2</li>' +
						'</ul>'
					);

					testInsert(
						'after same indent',

						'<paragraph>p</paragraph>' +
						'<listItem indent="0" type="bulleted">1</listItem>' +
						'<listItem indent="1" type="bulleted">1.1</listItem>' +
						'[<listItem indent="1" type="bulleted">x</listItem>]',

						'<p>p</p>' +
						'<ul>' +
							'<li>' +
								'1' +
								'<ul>' +
									'<li>1.1</li>' +
									'<li>x</li>' +
								'</ul>' +
							'</li>' +
						'</ul>'
					);

					testInsert(
						'after same indent, before bigger indent',

						'<paragraph>p</paragraph>' +
						'<listItem indent="0" type="bulleted">1</listItem>' +
						'[<listItem indent="0" type="bulleted">x</listItem>]' +
						'<listItem indent="1" type="bulleted">1.1</listItem>',

						'<p>p</p>' +
						'<ul>' +
							'<li>1</li>' +
							'<li>' +
								'x' +
								'<ul>' +
									'<li>1.1</li>' +
								'</ul>' +
							'</li>' +
						'</ul>'
					);

					testInsert(
						'after bigger indent, before bigger indent',

						'<paragraph>p</paragraph>' +
						'<listItem indent="0" type="bulleted">1</listItem>' +
						'<listItem indent="1" type="bulleted">1.1</listItem>' +
						'[<listItem indent="0" type="bulleted">x</listItem>]' +
						'<listItem indent="1" type="bulleted">1.2</listItem>',

						'<p>p</p>' +
						'<ul>' +
							'<li>' +
								'1' +
								'<ul>' +
									'<li>1.1</li>' +
								'</ul>' +
							'</li>' +
							'<li>' +
								'x' +
								'<ul>' +
									'<li>1.2</li>' +
								'</ul>' +
							'</li>' +
						'</ul>'
					);

					testInsert(
						'list items with too big indent',

						'<listItem indent="0" type="bulleted">a</listItem>' +
						'<listItem indent="1" type="bulleted">b</listItem>' +
						'[<listItem indent="4" type="bulleted">x</listItem>' + // This indent should be fixed by post fixer.
						'<listItem indent="5" type="bulleted">x</listItem>' + // This indent should be fixed by post fixer.
						'<listItem indent="4" type="bulleted">x</listItem>]' + // This indent should be fixed by post fixer.
						'<listItem indent="1" type="bulleted">c</listItem>',

						'<ul>' +
							'<li>' +
								'a' +
								'<ul>' +
									'<li>' +
										'b' +
										'<ul>' +
											'<li>' +
												'x' +
												'<ul>' +
													'<li>x</li>' +
												'</ul>' +
											'</li>' +
											'<li>x</li>' +
										'</ul>' +
									'</li>' +
									'<li>c</li>' +
								'</ul>' +
							'</li>' +
						'</ul>'
					);
				} );

				describe( 'different list type', () => {
					testInsert(
						'after smaller indent, before same indent',

						'<paragraph>p</paragraph>' +
						'<listItem indent="0" type="bulleted">1</listItem>' +
						'[<listItem indent="1" type="numbered">x</listItem>]' +
						'<listItem indent="1" type="bulleted">1.1</listItem>',

						'<p>p</p>' +
						'<ul>' +
							'<li>' +
								'1' +
								'<ol>' +
									'<li>x</li>' +
								'</ol>' +
								'<ul>' +
									'<li>1.1</li>' +
								'</ul>' +
							'</li>' +
						'</ul>'
					);

					testInsert(
						'after same indent',

						'<paragraph>p</paragraph>' +
						'<listItem indent="0" type="bulleted">1</listItem>' +
						'<listItem indent="1" type="bulleted">1.1</listItem>' +
						'[<listItem indent="1" type="numbered">x</listItem>]',

						'<p>p</p>' +
						'<ul>' +
							'<li>' +
								'1' +
								'<ul>' +
									'<li>1.1</li>' +
								'</ul>' +
								'<ol>' +
									'<li>x</li>' +
								'</ol>' +
							'</li>' +
						'</ul>'
					);

					testInsert(
						'after same indent, before bigger indent',

						'<paragraph>p</paragraph>' +
						'<listItem indent="0" type="bulleted">1</listItem>' +
						'[<listItem indent="0" type="numbered">x</listItem>]' +
						'<listItem indent="1" type="bulleted">1.1</listItem>',

						'<p>p</p>' +
						'<ul>' +
							'<li>1</li>' +
						'</ul>' +
						'<ol>' +
							'<li>' +
								'x' +
								'<ul>' +
									'<li>1.1</li>' +
								'</ul>' +
							'</li>' +
						'</ol>'
					);

					testInsert(
						'after bigger indent, before bigger indent',

						'<paragraph>p</paragraph>' +
						'<listItem indent="0" type="bulleted">1</listItem>' +
						'<listItem indent="1" type="bulleted">1.1</listItem>' +
						'[<listItem indent="0" type="numbered">x</listItem>]' +
						'<listItem indent="1" type="bulleted">1.2</listItem>',

						'<p>p</p>' +
						'<ul>' +
							'<li>' +
								'1' +
								'<ul>' +
									'<li>1.1</li>' +
								'</ul>' +
							'</li>' +
						'</ul>' +
						'<ol>' +
							'<li>' +
								'x' +
								'<ul>' +
									'<li>1.2</li>' +
								'</ul>' +
							'</li>' +
						'</ol>'
					);
				} );

				// This case is pretty complex but it tests various edge cases concerning splitting lists.
				testInsert(
					'element between nested list items - complex',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'<listItem indent="1" type="bulleted">b</listItem>' +
					'<listItem indent="2" type="bulleted">c</listItem>' +
					'<listItem indent="3" type="bulleted">d</listItem>' +
					'[<paragraph>x</paragraph>]' +
					'<listItem indent="3" type="bulleted">e</listItem>' + // This indent should be fixed by post fixer.
					'<listItem indent="2" type="bulleted">f</listItem>' + // This indent should be fixed by post fixer.
					'<listItem indent="3" type="bulleted">g</listItem>' + // This indent should be fixed by post fixer.
					'<listItem indent="1" type="numbered">h</listItem>' + // This indent should be fixed by post fixer.
					'<listItem indent="2" type="numbered">i</listItem>' + // This indent should be fixed by post fixer.
					'<listItem indent="0" type="numbered">j</listItem>' + // This indent should be fixed by post fixer.
					'<paragraph>p</paragraph>',

					'<ul>' +
						'<li>' +
							'a' +
							'<ul>' +
								'<li>' +
									'b' +
									'<ul>' +
										'<li>' +
											'c' +
											'<ul>' +
												'<li>d</li>' +
											'</ul>' +
										'</li>' +
									'</ul>' +
								'</li>' +
							'</ul>' +
						'</li>' +
					'</ul>' +
					'<p>x</p>' +
					'<ul>' +
						'<li>e</li>' +
						'<li>' +
							'f' +
							'<ul>' +
								'<li>g</li>' +
							'</ul>' +
						'</li>' +
					'</ul>' +
					'<ol>' +
						'<li>' +
							'h' +
							'<ol>' +
								'<li>i</li>' +
							'</ol>' +
						'</li>' +
						'<li>j</li>' +
					'</ol>' +
					'<p>p</p>',

					false
				);

				testInsert(
					'element before indent "hole"',

					'<listItem indent="0" type="bulleted">1</listItem>' +
					'<listItem indent="1" type="bulleted">1.1</listItem>' +
					'[<paragraph>x</paragraph>]' +
					'<listItem indent="2" type="bulleted">1.1.1</listItem>' + // This indent should be fixed by post fixer.
					'<listItem indent="0" type="bulleted">2</listItem>',

					'<ul>' +
						'<li>' +
							'1' +
							'<ul>' +
								'<li>1.1</li>' +
							'</ul>' +
						'</li>' +
					'</ul>' +
					'<p>x</p>' +
					'<ul>' +
						'<li>1.1.1</li>' +
						'<li>2</li>' +
					'</ul>',

					false
				);
			} );

			describe( 'remove', () => {
				testRemove(
					'remove the first nested item',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<listItem indent="1" type="bulleted">b</listItem>]' +
					'<listItem indent="1" type="bulleted">c</listItem>',

					'<ul>' +
						'<li>' +
							'a' +
							'<ul>' +
								'<li>c</li>' +
							'</ul>' +
						'</li>' +
					'</ul>'
				);

				testRemove(
					'remove nested item from the middle',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'<listItem indent="1" type="bulleted">b</listItem>' +
					'[<listItem indent="1" type="bulleted">c</listItem>]' +
					'<listItem indent="1" type="bulleted">d</listItem>',

					'<ul>' +
						'<li>' +
							'a' +
							'<ul>' +
								'<li>b</li>' +
								'<li>d</li>' +
							'</ul>' +
						'</li>' +
					'</ul>'
				);

				testRemove(
					'remove the last nested item',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'<listItem indent="1" type="bulleted">b</listItem>' +
					'[<listItem indent="1" type="bulleted">c</listItem>]',

					'<ul>' +
						'<li>' +
							'a' +
							'<ul>' +
								'<li>b</li>' +
							'</ul>' +
						'</li>' +
					'</ul>'
				);

				testRemove(
					'remove the only nested item',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<listItem indent="1" type="bulleted">c</listItem>]',

					'<ul>' +
						'<li>a</li>' +
					'</ul>'
				);

				testRemove(
					'remove the only nested item from list that separates two lists',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'<listItem indent="1" type="numbered">b</listItem>' +
					'[<listItem indent="1" type="bulleted">c</listItem>]' +
					'<listItem indent="1" type="numbered">d</listItem>',

					'<ul>' +
						'<li>' +
							'a' +
							'<ol>' +
								'<li>b</li>' +
								'<li>d</li>' +
							'</ol>' +
						'</li>' +
					'</ul>'
				);

				testRemove(
					'remove item that has nested lists, previous item has same indent',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<listItem indent="0" type="bulleted">b</listItem>]' +
					'<listItem indent="1" type="bulleted">c</listItem>' +
					'<listItem indent="1" type="numbered">d</listItem>',

					'<ul>' +
						'<li>' +
							'a' +
							'<ul>' +
								'<li>c</li>' +
							'</ul>' +
							'<ol>' +
								'<li>d</li>' +
							'</ol>' +
						'</li>' +
					'</ul>'
				);

				testRemove(
					'remove item that has nested lists, previous item has smaller indent',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<listItem indent="1" type="bulleted">b</listItem>]' +
					'<listItem indent="2" type="bulleted">c</listItem>' +
					'<listItem indent="2" type="numbered">d</listItem>',

					'<ul>' +
						'<li>' +
							'a' +
							'<ul>' +
								'<li>c</li>' +
							'</ul>' +
							'<ol>' +
								'<li>d</li>' +
							'</ol>' +
						'</li>' +
					'</ul>'
				);

				testRemove(
					'remove item that has nested lists, previous item has bigger indent by 1',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'<listItem indent="1" type="bulleted">b</listItem>' +
					'[<listItem indent="0" type="bulleted">c</listItem>]' +
					'<listItem indent="1" type="bulleted">d</listItem>' +
					'<listItem indent="2" type="numbered">e</listItem>',

					'<ul>' +
						'<li>' +
							'a' +
							'<ul>' +
								'<li>b</li>' +
								'<li>' +
									'd' +
									'<ol>' +
										'<li>e</li>' +
									'</ol>' +
								'</li>' +
							'</ul>' +
						'</li>' +
					'</ul>'
				);

				testRemove(
					'remove item that has nested lists, previous item has bigger indent by 2',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'<listItem indent="1" type="bulleted">b</listItem>' +
					'<listItem indent="2" type="bulleted">c</listItem>' +
					'[<listItem indent="0" type="bulleted">d</listItem>]' +
					'<listItem indent="1" type="bulleted">e</listItem>',

					'<ul>' +
						'<li>' +
							'a' +
							'<ul>' +
								'<li>' +
									'b' +
									'<ul>' +
										'<li>c</li>' +
									'</ul>' +
								'</li>' +
								'<li>e</li>' +
							'</ul>' +
						'</li>' +
					'</ul>'
				);

				testRemove(
					'remove first list item that has nested list',

					'[<listItem indent="0" type="bulleted">a</listItem>]' +
					'<listItem indent="1" type="bulleted">b</listItem>' + // This indent should be fixed by post fixer.
					'<listItem indent="2" type="bulleted">c</listItem>', // This indent should be fixed by post fixer.

					'<ul>' +
						'<li>' +
							'b' +
							'<ul>' +
								'<li>c</li>' +
							'</ul>' +
						'</li>' +
					'</ul>'
				);
			} );

			describe( 'change type', () => {
				testChangeType(
					'list item that has nested items',

					'[<listItem indent="0" type="numbered">a</listItem>]' +
					'<listItem indent="1" type="bulleted">b</listItem>' +
					'<listItem indent="1" type="bulleted">c</listItem>',

					'<ul>' +
						'<li>' +
							'a' +
							'<ul>' +
								'<li>b</li>' +
								'<li>c</li>' +
							'</ul>' +
						'</li>' +
					'</ul>'
				);

				testChangeType(
					'list item that is a nested item',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'<listItem indent="1" type="numbered">b</listItem>' +
					'[<listItem indent="1" type="numbered">c</listItem>]' +
					'<listItem indent="1" type="numbered">d</listItem>',

					'<ul>' +
						'<li>' +
							'a' +
							'<ol>' +
								'<li>b</li>' +
							'</ol>' +
							'<ul>' +
								'<li>c</li>' +
							'</ul>' +
							'<ol>' +
								'<li>d</li>' +
							'</ol>' +
						'</li>' +
					'</ul>'
				);

				testChangeType(
					'list item between two nested items',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'<listItem indent="1" type="bulleted">b</listItem>' +
					'[<listItem indent="1" type="numbered">c</listItem>]' +
					'<listItem indent="1" type="bulleted">d</listItem>',

					'<ul>' +
						'<li>' +
							'a' +
							'<ul>' +
								'<li>b</li>' +
								'<li>c</li>' +
								'<li>d</li>' +
							'</ul>' +
						'</li>' +
					'</ul>'
				);
			} );

			describe( 'change indent', () => {
				describe( 'same list type', () => {
					testChangeIndent(
						'indent last item of flat list', 1,

						'<listItem indent="0" type="bulleted">a</listItem>' +
						'[<listItem indent="0" type="bulleted">b</listItem>]',

						'<ul>' +
							'<li>' +
								'a' +
								'<ul>' +
									'<li>b</li>' +
								'</ul>' +
							'</li>' +
						'</ul>'
					);

					testChangeIndent(
						'indent middle item of flat list', 1,

						'<listItem indent="0" type="bulleted">a</listItem>' +
						'[<listItem indent="0" type="bulleted">b</listItem>]' +
						'<listItem indent="0" type="bulleted">c</listItem>',

						'<ul>' +
							'<li>' +
								'a' +
								'<ul>' +
									'<li>b</li>' +
								'</ul>' +
							'</li>' +
							'<li>c</li>' +
						'</ul>'
					);

					testChangeIndent(
						'indent last item in nested list', 2,

						'<listItem indent="0" type="bulleted">a</listItem>' +
						'<listItem indent="1" type="bulleted">b</listItem>' +
						'[<listItem indent="1" type="bulleted">c</listItem>]',

						'<ul>' +
							'<li>' +
								'a' +
								'<ul>' +
									'<li>' +
										'b' +
										'<ul>' +
											'<li>c</li>' +
										'</ul>' +
									'</li>' +
								'</ul>' +
							'</li>' +
						'</ul>'
					);

					testChangeIndent(
						'indent middle item in nested list', 2,

						'<listItem indent="0" type="bulleted">a</listItem>' +
						'<listItem indent="1" type="bulleted">b</listItem>' +
						'[<listItem indent="1" type="bulleted">c</listItem>]' +
						'<listItem indent="1" type="bulleted">d</listItem>',

						'<ul>' +
							'<li>' +
								'a' +
								'<ul>' +
									'<li>' +
										'b' +
										'<ul>' +
											'<li>c</li>' +
										'</ul>' +
									'</li>' +
									'<li>d</li>' +
								'</ul>' +
							'</li>' +
						'</ul>'
					);

					// Keep in mind that this test is different than "executing command on item that has nested list".
					// A command is automatically indenting nested items so the hierarchy is preserved.
					// Here we test conversion and the change is simple changing indent of one item.
					// This may be true also for other tests in this suite, keep this in mind.
					testChangeIndent(
						'indent item that has nested list', 1,

						'<listItem indent="0" type="bulleted">a</listItem>' +
						'[<listItem indent="0" type="bulleted">b</listItem>]' +
						'<listItem indent="1" type="bulleted">c</listItem>',

						'<ul>' +
							'<li>' +
								'a' +
								'<ul>' +
									'<li>b</li>' +
									'<li>c</li>' +
								'</ul>' +
							'</li>' +
						'</ul>'
					);

					testChangeIndent(
						'indent item that in view is a next sibling of item that has nested list', 1,

						'<listItem indent="0" type="bulleted">a</listItem>' +
						'<listItem indent="1" type="bulleted">b</listItem>' +
						'[<listItem indent="0" type="bulleted">c</listItem>]' +
						'<listItem indent="1" type="bulleted">d</listItem>',

						'<ul>' +
							'<li>' +
								'a' +
								'<ul>' +
									'<li>b</li>' +
									'<li>c</li>' +
									'<li>d</li>' +
								'</ul>' +
							'</li>' +
						'</ul>'
					);

					testChangeIndent(
						'outdent the first item of nested list', 0,

						'<listItem indent="0" type="bulleted">a</listItem>' +
						'[<listItem indent="1" type="bulleted">b</listItem>]' +
						'<listItem indent="1" type="bulleted">c</listItem>' +
						'<listItem indent="1" type="bulleted">d</listItem>',

						'<ul>' +
							'<li>a</li>' +
							'<li>' +
								'b' +
								'<ul>' +
									'<li>c</li>' +
									'<li>d</li>' +
								'</ul>' +
							'</li>' +
						'</ul>'
					);

					testChangeIndent(
						'outdent item from the middle of nested list', 0,

						'<listItem indent="0" type="bulleted">a</listItem>' +
						'<listItem indent="1" type="bulleted">b</listItem>' +
						'[<listItem indent="1" type="bulleted">c</listItem>]' +
						'<listItem indent="1" type="bulleted">d</listItem>',

						'<ul>' +
							'<li>' +
								'a' +
								'<ul>' +
									'<li>b</li>' +
								'</ul>' +
							'</li>' +
							'<li>' +
								'c' +
								'<ul>' +
									'<li>d</li>' +
								'</ul>' +
							'</li>' +
						'</ul>'
					);

					testChangeIndent(
						'outdent the last item of nested list', 0,

						'<listItem indent="0" type="bulleted">a</listItem>' +
						'<listItem indent="1" type="bulleted">b</listItem>' +
						'[<listItem indent="1" type="bulleted">c</listItem>]',

						'<ul>' +
							'<li>' +
								'a' +
								'<ul>' +
									'<li>b</li>' +
								'</ul>' +
							'</li>' +
							'<li>c</li>' +
						'</ul>'
					);

					testChangeIndent(
						'outdent the only item of nested list', 1,

						'<listItem indent="0" type="bulleted">a</listItem>' +
						'<listItem indent="1" type="bulleted">b</listItem>' +
						'[<listItem indent="2" type="bulleted">c</listItem>]' +
						'<listItem indent="1" type="bulleted">d</listItem>',

						'<ul>' +
							'<li>' +
								'a' +
								'<ul>' +
									'<li>b</li>' +
									'<li>c</li>' +
									'<li>d</li>' +
								'</ul>' +
							'</li>' +
						'</ul>'
					);

					testChangeIndent(
						'outdent item by two', 0,

						'<listItem indent="0" type="bulleted">a</listItem>' +
						'<listItem indent="1" type="bulleted">b</listItem>' +
						'[<listItem indent="2" type="bulleted">c</listItem>]' +
						'<listItem indent="0" type="bulleted">d</listItem>',

						'<ul>' +
							'<li>' +
								'a' +
								'<ul>' +
									'<li>b</li>' +
								'</ul>' +
							'</li>' +
							'<li>c</li>' +
							'<li>d</li>' +
						'</ul>'
					);
				} );

				describe( 'different list type', () => {
					testChangeIndent(
						'indent middle item of flat list', 1,

						'<listItem indent="0" type="bulleted">a</listItem>' +
						'[<listItem indent="0" type="numbered">b</listItem>]' +
						'<listItem indent="0" type="bulleted">c</listItem>',

						'<ul>' +
							'<li>' +
								'a' +
								'<ol>' +
									'<li>b</li>' +
								'</ol>' +
							'</li>' +
							'<li>c</li>' +
						'</ul>'
					);

					testChangeIndent(
						'indent item that has nested list', 1,

						'<listItem indent="0" type="bulleted">a</listItem>' +
						'[<listItem indent="0" type="numbered">b</listItem>]' +
						'<listItem indent="1" type="bulleted">c</listItem>',

						'<ul>' +
							'<li>' +
								'a' +
								'<ol>' +
									'<li>b</li>' +
								'</ol>' +
								'<ul>' +
									'<li>c</li>' +
								'</ul>' +
							'</li>' +
						'</ul>'
					);

					testChangeIndent(
						'indent item that in view is a next sibling of item that has nested list #1', 1,

						'<listItem indent="0" type="bulleted">a</listItem>' +
						'<listItem indent="1" type="bulleted">b</listItem>' +
						'[<listItem indent="0" type="numbered">c</listItem>]' +
						'<listItem indent="1" type="bulleted">d</listItem>',

						'<ul>' +
							'<li>' +
								'a' +
								'<ul>' +
									'<li>b</li>' +
								'</ul>' +
								'<ol>' +
									'<li>c</li>' +
								'</ol>' +
								'<ul>' +
									'<li>d</li>' +
								'</ul>' +
							'</li>' +
						'</ul>'
					);

					testChangeIndent(
						'outdent the first item of nested list', 0,

						'<listItem indent="0" type="bulleted">a</listItem>' +
						'[<listItem indent="1" type="numbered">b</listItem>]' +
						'<listItem indent="1" type="bulleted">c</listItem>' +
						'<listItem indent="1" type="bulleted">d</listItem>',

						'<ul>' +
							'<li>a</li>' +
						'</ul>' +
						'<ol>' +
							'<li>' +
								'b' +
								'<ul>' +
									'<li>c</li>' +
									'<li>d</li>' +
								'</ul>' +
							'</li>' +
						'</ol>'
					);

					testChangeIndent(
						'outdent the only item of nested list', 1,

						'<listItem indent="0" type="bulleted">a</listItem>' +
						'<listItem indent="1" type="bulleted">b</listItem>' +
						'[<listItem indent="2" type="numbered">c</listItem>]' +
						'<listItem indent="1" type="bulleted">d</listItem>',

						'<ul>' +
							'<li>' +
								'a' +
								'<ul>' +
									'<li>b</li>' +
								'</ul>' +
								'<ol>' +
									'<li>c</li>' +
								'</ol>' +
								'<ul>' +
									'<li>d</li>' +
								'</ul>' +
							'</li>' +
						'</ul>'
					);

					testChangeIndent(
						'outdent item by two', 0,

						'<listItem indent="0" type="bulleted">a</listItem>' +
						'<listItem indent="1" type="bulleted">b</listItem>' +
						'[<listItem indent="2" type="numbered">c</listItem>]' +
						'<listItem indent="0" type="bulleted">d</listItem>',

						'<ul>' +
							'<li>' +
								'a' +
								'<ul>' +
									'<li>b</li>' +
								'</ul>' +
							'</li>' +
						'</ul>' +
						'<ol>' +
							'<li>c</li>' +
						'</ol>' +
						'<ul>' +
							'<li>d</li>' +
						'</ul>'
					);
				} );
			} );

			describe( 'rename from list item', () => {
				testRenameFromListItem(
					'rename nested item from the middle #1',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'<listItem indent="1" type="bulleted">b</listItem>' +
					'[<listItem indent="1" type="bulleted">c</listItem>]' +
					'<listItem indent="1" type="bulleted">d</listItem>', // This indent should be fixed by post fixer.

					'<ul>' +
						'<li>' +
							'a' +
							'<ul>' +
								'<li>b</li>' +
							'</ul>' +
						'</li>' +
					'</ul>' +
					'<p>c</p>' +
					'<ul>' +
						'<li>d</li>' +
					'</ul>',

					false
				);

				testRenameFromListItem(
					'rename nested item from the middle #2 - nightmare example',

					// Indents in this example should be fixed by post fixer.
					// This nightmare example checks if structure of the list is kept as intact as possible.
					'<listItem indent="0" type="bulleted">a</listItem>' +	// a --------			-->  a --------
					'<listItem indent="1" type="bulleted">b</listItem>' +	//   b --------			-->    b --------
					'[<listItem indent="2" type="bulleted">c</listItem>]' +	//     c --------		--> --------
					'<listItem indent="3" type="bulleted">d</listItem>' +	//       d --------		-->  d --------
					'<listItem indent="3" type="bulleted">e</listItem>' +	//       e --------		-->  e --------
					'<listItem indent="4" type="bulleted">f</listItem>' +	//         f --------	-->    f --------
					'<listItem indent="2" type="bulleted">g</listItem>' +	//     g --------		-->  g --------
					'<listItem indent="3" type="bulleted">h</listItem>' +	//       h --------		-->    h --------
					'<listItem indent="4" type="bulleted">i</listItem>' +	//         i --------	-->      i --------
					'<listItem indent="1" type="bulleted">j</listItem>' +	//   j --------			-->  j --------
					'<listItem indent="2" type="bulleted">k</listItem>' +	//     k --------		-->    k --------
					'<listItem indent="0" type="bulleted">l</listItem>' +	// l --------			-->  l --------
					'<listItem indent="1" type="bulleted">m</listItem>',	//   m --------			-->    m --------

					'<ul>' +
						'<li>' +
							'a' +
							'<ul>' +
								'<li>b</li>' +
							'</ul>' +
						'</li>' +
					'</ul>' +
					'<p>c</p>' +
					'<ul>' +
						'<li>d</li>' +
						'<li>' +
							'e' +
							'<ul>' +
								'<li>f</li>' +
							'</ul>' +
						'</li>' +
						'<li>' +
							'g' +
							'<ul>' +
								'<li>' +
									'h' +
									'<ul>' +
										'<li>i</li>' +
									'</ul>' +
								'</li>' +
							'</ul>' +
						'</li>' +
						'<li>' +
							'j' +
							'<ul>' +
								'<li>k</li>' +
							'</ul>' +
						'</li>' +
						'<li>' +
							'l' +
							'<ul>' +
								'<li>m</li>' +
							'</ul>' +
						'</li>' +
					'</ul>',

					false
				);

				testRenameFromListItem(
					'rename nested item from the middle #3 - manual test example',

					// Indents in this example should be fixed by post fixer.
					// This example checks a bug found by testing manual test.
					'<listItem indent="0" type="bulleted">a</listItem>' +
					'<listItem indent="1" type="bulleted">b</listItem>' +
					'[<listItem indent="2" type="bulleted">c</listItem>]' +
					'<listItem indent="1" type="bulleted">d</listItem>' +
					'<listItem indent="2" type="bulleted">e</listItem>' +
					'<listItem indent="2" type="bulleted">f</listItem>' +
					'<listItem indent="2" type="numbered">g</listItem>' +
					'<listItem indent="2" type="numbered">h</listItem>' +
					'<listItem indent="0" type="bulleted"></listItem>' +
					'<listItem indent="1" type="bulleted"></listItem>' +
					'<listItem indent="2" type="numbered">k</listItem>' +
					'<listItem indent="2" type="numbered">l</listItem>',

					'<ul>' +
						'<li>' +
							'a' +
							'<ul>' +
								'<li>b</li>' +
							'</ul>' +
						'</li>' +
					'</ul>' +
					'<p>c</p>' +
					'<ul>' +
						'<li>' +
							'd' +
							'<ul>' +
								'<li>e</li>' +
								'<li>f</li>' +
							'</ul>' +
							'<ol>' +
								'<li>g</li>' +
								'<li>h</li>' +
							'</ol>' +
						'</li>' +
						'<li>' +
							'<ul>' +
								'<li>' +
									'<ol>' +
										'<li>k</li>' +
										'<li>l</li>' +
									'</ol>' +
								'</li>' +
							'</ul>' +
						'</li>' +
					'</ul>',

					false
				);

				testRenameFromListItem(
					'rename the only nested item',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<listItem indent="1" type="bulleted">b</listItem>]',

					'<ul>' +
						'<li>a</li>' +
					'</ul>' +
					'<p>b</p>'
				);
			} );

			describe( 'rename to list item (with attribute change)', () => {
				testRenameToListItem(
					'element into first item in nested list', 1,

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<paragraph>b</paragraph>]',

					'<ul>' +
						'<li>' +
							'a' +
							'<ul>' +
								'<li>b</li>' +
							'</ul>' +
						'</li>' +
					'</ul>'
				);

				testRenameToListItem(
					'element into last item in nested list', 1,

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'<listItem indent="1" type="bulleted">b</listItem>' +
					'[<paragraph>c</paragraph>]',

					'<ul>' +
						'<li>' +
							'a' +
							'<ul>' +
								'<li>b</li>' +
								'<li>c</li>' +
							'</ul>' +
						'</li>' +
					'</ul>'
				);

				testRenameToListItem(
					'element into a first item in deeply nested list', 2,

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'<listItem indent="1" type="bulleted">b</listItem>' +
					'[<paragraph>c</paragraph>]' +
					'<listItem indent="0" type="bulleted">d</listItem>',

					'<ul>' +
						'<li>' +
							'a' +
							'<ul>' +
								'<li>' +
									'b' +
									'<ul>' +
										'<li>c</li>' +
									'</ul>' +
								'</li>' +
							'</ul>' +
						'</li>' +
						'<li>d</li>' +
					'</ul>'
				);
			} );

			describe( 'move', () => {
				// Since move is in fact remove + insert and does not event have its own converter, only a few cases will be tested here.

				testMove(
					'move out nested list items',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'[<listItem indent="1" type="bulleted">b</listItem>' +
					'<listItem indent="2" type="bulleted">c</listItem>]' +
					'<listItem indent="3" type="bulleted">d</listItem>' + // This indent should be fixed by post fixer.
					'<listItem indent="4" type="bulleted">e</listItem>' + // This indent should be fixed by post fixer.
					'<paragraph>x</paragraph>',

					6,

					'<ul>' +
						'<li>' +
							'a' +
							'<ul>' +
								'<li>' +
									'd' +
									'<ul>' +
										'<li>e</li>' +
									'</ul>' +
								'</li>' +
							'</ul>' +
						'</li>' +
					'</ul>' +
					'<p>x</p>' +
					'<ul>' +
						'<li>' +
							'b' +
							'<ul>' +
								'<li>c</li>' +
							'</ul>' +
						'</li>' +
					'</ul>'
				);

				testMove(
					'move nested list items between lists of same type',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'<listItem indent="1" type="bulleted">b</listItem>' +
					'[<listItem indent="2" type="bulleted">c</listItem>' +
					'<listItem indent="3" type="bulleted">d</listItem>]' +
					'<listItem indent="4" type="bulleted">e</listItem>' +
					'<paragraph>x</paragraph>' +
					'<listItem indent="0" type="bulleted">f</listItem>' +
					'<listItem indent="0" type="bulleted">g</listItem>',

					7,

					'<ul>' +
						'<li>' +
							'a' +
							'<ul>' +
								'<li>' +
									'b' +
									'<ul>' +
										'<li>e</li>' +
									'</ul>' +
								'</li>' +
							'</ul>' +
						'</li>' +
					'</ul>' +
					'<p>x</p>' +
					'<ul>' +
						'<li>' +
							'f' +
							'<ul>' +
								'<li>' +
									'c' +
									'<ul>' +
										'<li>d</li>' +
									'</ul>' +
								'</li>' +
							'</ul>' +
						'</li>' +
						'<li>g</li>' +
					'</ul>'
				);

				testMove(
					'move nested list items between lists of different type',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'<listItem indent="1" type="bulleted">b</listItem>' +
					'[<listItem indent="2" type="bulleted">c</listItem>' +
					'<listItem indent="3" type="bulleted">d</listItem>]' +
					'<listItem indent="4" type="bulleted">e</listItem>' +
					'<paragraph>x</paragraph>' +
					'<listItem indent="0" type="numbered">f</listItem>' +
					'<listItem indent="1" type="numbered">g</listItem>',

					7,

					'<ul>' +
						'<li>' +
							'a' +
							'<ul>' +
								'<li>' +
									'b' +
									'<ul>' +
										'<li>e</li>' +
									'</ul>' +
								'</li>' +
							'</ul>' +
						'</li>' +
					'</ul>' +
					'<p>x</p>' +
					'<ol>' +
						'<li>' +
							'f' +
							'<ul>' +
								'<li>' +
									'c' +
									'<ul>' +
										'<li>d</li>' +
									'</ul>' +
								'</li>' +
							'</ul>' +
							'<ol>' +
								'<li>g</li>' +
							'</ol>' +
						'</li>' +
					'</ol>'
				);

				testMove(
					'move element between nested list',

					'<listItem indent="0" type="bulleted">a</listItem>' +
					'<listItem indent="1" type="bulleted">b</listItem>' +
					'<listItem indent="2" type="bulleted">c</listItem>' +
					'<listItem indent="3" type="bulleted">d</listItem>' +
					'[<paragraph>x</paragraph>]',

					2,

					'<ul>' +
						'<li>' +
							'a' +
							'<ul>' +
								'<li>b</li>' +
							'</ul>' +
						'</li>' +
					'</ul>' +
					'<p>x</p>' +
					'<ul>' +
						'<li>' +
							'c' +
							'<ul>' +
								'<li>d</li>' +
							'</ul>' +
						'</li>' +
					'</ul>',

					false
				);
			} );
		} );
	} );

	describe( 'post fixer', () => {
		it( 'insert element before nested list', () => {
			const modelBefore =
				'<listItem indent="0" type="bulleted">a</listItem>' +
				'<listItem indent="1" type="bulleted">b</listItem>' +
				'[]' +
				'<listItem indent="2" type="bulleted">d</listItem>' +
				'<listItem indent="2" type="bulleted">e</listItem>' +
				'<listItem indent="3" type="bulleted">f</listItem>';

			const insertedElement = '<paragraph>x</paragraph>';

			const expectedModel =
				'<listItem indent="0" type="bulleted">a</listItem>' +
				'<listItem indent="1" type="bulleted">b</listItem>' +
				'<paragraph>x</paragraph>' +
				'<listItem indent="0" type="bulleted">d</listItem>' +
				'<listItem indent="0" type="bulleted">e</listItem>' +
				'<listItem indent="1" type="bulleted">f</listItem>';

			// Set model data without inserted element but with selection.
			setModelData( modelDoc, modelBefore );

			modelDoc.enqueueChanges( () => {
				modelDoc.batch().insert( modelDoc.selection.getFirstPosition(), parseModel( insertedElement, modelDoc.schema ) );
			} );

			expect( getModelData( modelDoc, { withoutSelection: true } ) ).to.equal( expectedModel );
		} );

		it( 'insert list item before nested list', () => {
			const modelBefore =
				'<listItem indent="0" type="bulleted">a</listItem>' +
				'<listItem indent="1" type="bulleted">b</listItem>' +
				'[]' +
				'<listItem indent="2" type="bulleted">d</listItem>' +
				'<listItem indent="2" type="bulleted">e</listItem>' +
				'<listItem indent="3" type="bulleted">f</listItem>';

			const insertedElement = '<listItem indent="0" type="bulleted">x</listItem>';

			const expectedModel =
				'<listItem indent="0" type="bulleted">a</listItem>' +
				'<listItem indent="1" type="bulleted">b</listItem>' +
				'<listItem indent="0" type="bulleted">x</listItem>' +
				'<listItem indent="1" type="bulleted">d</listItem>' +
				'<listItem indent="1" type="bulleted">e</listItem>' +
				'<listItem indent="2" type="bulleted">f</listItem>';

			// Set model data without inserted element but with selection.
			setModelData( modelDoc, modelBefore );

			modelDoc.enqueueChanges( () => {
				modelDoc.batch().insert( modelDoc.selection.getFirstPosition(), parseModel( insertedElement, modelDoc.schema ) );
			} );

			expect( getModelData( modelDoc, { withoutSelection: true } ) ).to.equal( expectedModel );
		} );

		it( 'insert list items with too big indent', () => {
			const modelBefore =
				'<listItem indent="0" type="bulleted">a</listItem>' +
				'<listItem indent="1" type="bulleted">b</listItem>' +
				'[]' +
				'<listItem indent="1" type="bulleted">c</listItem>';

			const insertedElement =
				'<listItem indent="4" type="bulleted">x</listItem>' +
				'<listItem indent="5" type="bulleted">x</listItem>' +
				'<listItem indent="4" type="bulleted">x</listItem>';

			const expectedModel =
				'<listItem indent="0" type="bulleted">a</listItem>' +
				'<listItem indent="1" type="bulleted">b</listItem>' +
				'<listItem indent="2" type="bulleted">x</listItem>' +
				'<listItem indent="3" type="bulleted">x</listItem>' +
				'<listItem indent="2" type="bulleted">x</listItem>' +
				'<listItem indent="1" type="bulleted">c</listItem>';

			// Set model data without inserted element but with selection.
			setModelData( modelDoc, modelBefore );

			modelDoc.enqueueChanges( () => {
				modelDoc.batch().insert( modelDoc.selection.getFirstPosition(), parseModel( insertedElement, modelDoc.schema ) );
			} );

			expect( getModelData( modelDoc, { withoutSelection: true } ) ).to.equal( expectedModel );
		} );

		it( 'remove first list item', () => {
			const modelBefore =
				'[<listItem indent="0" type="bulleted">a</listItem>]' +
				'<listItem indent="1" type="bulleted">b</listItem>' +
				'<listItem indent="2" type="bulleted">c</listItem>';

			const expectedModel =
				'<listItem indent="0" type="bulleted">b</listItem>' +
				'<listItem indent="1" type="bulleted">c</listItem>';

			setModelData( modelDoc, modelBefore );

			modelDoc.enqueueChanges( () => {
				modelDoc.batch().remove( modelDoc.selection.getFirstRange() );
			} );

			expect( getModelData( modelDoc, { withoutSelection: true } ) ).to.equal( expectedModel );
		} );

		it( 'remove list item from nested list', () => {
			const modelBefore =
				'<listItem indent="0" type="bulleted">a</listItem>' +
				'[<listItem indent="1" type="bulleted">b</listItem>]' +
				'<listItem indent="2" type="bulleted">c</listItem>' +
				'<listItem indent="3" type="bulleted">d</listItem>' +
				'<listItem indent="1" type="bulleted">e</listItem>' +
				'<listItem indent="2" type="bulleted">f</listItem>';

			const expectedModel =
				'<listItem indent="0" type="bulleted">a</listItem>' +
				'<listItem indent="1" type="bulleted">c</listItem>' +
				'<listItem indent="2" type="bulleted">d</listItem>' +
				'<listItem indent="1" type="bulleted">e</listItem>' +
				'<listItem indent="2" type="bulleted">f</listItem>';

			setModelData( modelDoc, modelBefore );

			modelDoc.enqueueChanges( () => {
				modelDoc.batch().remove( modelDoc.selection.getFirstRange() );
			} );

			expect( getModelData( modelDoc, { withoutSelection: true } ) ).to.equal( expectedModel );
		} );

		it( 'rename nested item', () => {
			const modelBefore =
				'<listItem indent="0" type="bulleted">a</listItem>' +
				'<listItem indent="1" type="bulleted">b</listItem>' +
				'[<listItem indent="2" type="bulleted">c</listItem>]' +
				'<listItem indent="2" type="bulleted">d</listItem>' +
				'<listItem indent="3" type="bulleted">e</listItem>' +
				'<listItem indent="1" type="bulleted">f</listItem>' +
				'<listItem indent="2" type="bulleted">g</listItem>' +
				'<listItem indent="1" type="bulleted">h</listItem>' +
				'<listItem indent="2" type="bulleted">i</listItem>';

			const expectedModel =
				'<listItem indent="0" type="bulleted">a</listItem>' +
				'<listItem indent="1" type="bulleted">b</listItem>' +
				'<paragraph>c</paragraph>' +
				'<listItem indent="0" type="bulleted">d</listItem>' +
				'<listItem indent="1" type="bulleted">e</listItem>' +
				'<listItem indent="0" type="bulleted">f</listItem>' +
				'<listItem indent="1" type="bulleted">g</listItem>' +
				'<listItem indent="0" type="bulleted">h</listItem>' +
				'<listItem indent="1" type="bulleted">i</listItem>';

			setModelData( modelDoc, modelBefore );

			const element = modelDoc.selection.getFirstPosition().nodeAfter;

			modelDoc.enqueueChanges( () => {
				modelDoc.batch().rename( element, 'paragraph' );
			} );

			expect( getModelData( modelDoc, { withoutSelection: true } ) ).to.equal( expectedModel );
		} );

		it( 'move out nested list items', () => {
			const modelBefore =
				'<listItem indent="0" type="bulleted">a</listItem>' +
				'[<listItem indent="1" type="bulleted">b</listItem>' +
				'<listItem indent="2" type="bulleted">c</listItem>]' +
				'<listItem indent="3" type="bulleted">d</listItem>' +
				'<listItem indent="4" type="bulleted">e</listItem>' +
				'<paragraph>x</paragraph>';

			const expectedModel =
				'<listItem indent="0" type="bulleted">a</listItem>' +
				'<listItem indent="1" type="bulleted">d</listItem>' +
				'<listItem indent="2" type="bulleted">e</listItem>' +
				'<paragraph>x</paragraph>' +
				'<listItem indent="0" type="bulleted">b</listItem>' +
				'<listItem indent="1" type="bulleted">c</listItem>';

			setModelData( modelDoc, modelBefore );

			const targetPosition = ModelPosition.createAt( modelRoot, 6 );

			modelDoc.enqueueChanges( () => {
				modelDoc.batch().move( modelDoc.selection.getFirstRange(), targetPosition );
			} );

			expect( getModelData( modelDoc, { withoutSelection: true } ) ).to.equal( expectedModel );
		} );

		it( 'move list items between lists', () => {
			const modelBefore =
				'<listItem indent="0" type="bulleted">a</listItem>' +
				'<listItem indent="1" type="bulleted">b</listItem>' +
				'[<listItem indent="2" type="bulleted">c</listItem>' +
				'<listItem indent="3" type="bulleted">d</listItem>]' +
				'<listItem indent="4" type="bulleted">e</listItem>' +
				'<paragraph>x</paragraph>' +
				'<listItem indent="0" type="bulleted">f</listItem>' +
				'<listItem indent="0" type="bulleted">g</listItem>';

			const expectedModel =
				'<listItem indent="0" type="bulleted">a</listItem>' +
				'<listItem indent="1" type="bulleted">b</listItem>' +
				'<listItem indent="2" type="bulleted">e</listItem>' +
				'<paragraph>x</paragraph>' +
				'<listItem indent="0" type="bulleted">f</listItem>' +
				'<listItem indent="1" type="bulleted">c</listItem>' +
				'<listItem indent="2" type="bulleted">d</listItem>' +
				'<listItem indent="0" type="bulleted">g</listItem>';

			setModelData( modelDoc, modelBefore );

			const targetPosition = ModelPosition.createAt( modelRoot, 7 );

			modelDoc.enqueueChanges( () => {
				modelDoc.batch().move( modelDoc.selection.getFirstRange(), targetPosition );
			} );

			expect( getModelData( modelDoc, { withoutSelection: true } ) ).to.equal( expectedModel );
		} );

		it( 'move element between nested list items', () => {
			const modelBefore =
				'<listItem indent="0" type="bulleted">a</listItem>' +
				'<listItem indent="1" type="bulleted">b</listItem>' +
				'<listItem indent="2" type="bulleted">c</listItem>' +
				'<listItem indent="3" type="bulleted">d</listItem>' +
				'[<paragraph>x</paragraph>]';

			const expectedModel =
				'<listItem indent="0" type="bulleted">a</listItem>' +
				'<listItem indent="1" type="bulleted">b</listItem>' +
				'<paragraph>x</paragraph>' +
				'<listItem indent="0" type="bulleted">c</listItem>' +
				'<listItem indent="1" type="bulleted">d</listItem>';

			setModelData( modelDoc, modelBefore );

			const targetPosition = ModelPosition.createAt( modelRoot, 2 );

			modelDoc.enqueueChanges( () => {
				modelDoc.batch().move( modelDoc.selection.getFirstRange(), targetPosition );
			} );

			expect( getModelData( modelDoc, { withoutSelection: true } ) ).to.equal( expectedModel );
		} );
	} );

	describe( 'other', () => {
		it( 'model insert converter should not fire if change was already consumed', () => {
			editor.editing.modelToView.on( 'insert:listItem', ( evt, data, consumable ) => {
				consumable.consume( data.item, 'insert' );
			}, { priority: 'highest' } );

			// Paragraph is needed, otherwise selection throws.
			setModelData( modelDoc, '<paragraph>x</paragraph><listItem indent="0" type="bulleted"></listItem>' );

			expect( getViewData( editor.editing.view, { withoutSelection: true } ) ).to.equal( '<p>x</p>' );
		} );

		it( 'model remove converter should not fire if change was already consumed', () => {
			editor.editing.modelToView.on( 'remove', ( evt, data, consumable ) => {
				consumable.consume( data.item, 'remove' );
			}, { priority: 'highest' } );

			setModelData( modelDoc, '<listItem indent="0" type="bulleted"></listItem>' );

			modelDoc.batch().remove( modelRoot.getChild( 0 ) );

			expect( getViewData( editor.editing.view, { withoutSelection: true } ) ).to.equal( '<ul><li></li></ul>' );
		} );

		it( 'model change type converter should not fire if change was already consumed', () => {
			editor.editing.modelToView.on( 'changeAttribute:type', ( evt, data, consumable ) => {
				consumable.consume( data.item, 'changeAttribute:type' );
			}, { priority: 'highest' } );

			setModelData( modelDoc, '<listItem indent="0" type="bulleted"></listItem>' );

			modelDoc.batch().setAttribute( modelRoot.getChild( 0 ), 'type', 'numbered' );

			expect( getViewData( editor.editing.view, { withoutSelection: true } ) ).to.equal( '<ul><li></li></ul>' );
		} );

		it( 'model change indent converter should not fire if change was already consumed', () => {
			editor.editing.modelToView.on( 'changeAttribute:indent', ( evt, data, consumable ) => {
				consumable.consume( data.item, 'changeAttribute:indent' );
			}, { priority: 'highest' } );

			setModelData( modelDoc, '<listItem indent="0" type="bulleted">a</listItem><listItem indent="0" type="bulleted">b</listItem>' );

			modelDoc.batch().setAttribute( modelRoot.getChild( 1 ), 'indent', 1 );

			expect( getViewData( editor.editing.view, { withoutSelection: true } ) ).to.equal( '<ul><li>a</li><li>b</li></ul>' );
		} );

		it( 'view li converter should not fire if change was already consumed', () => {
			editor.data.viewToModel.on( 'element:li', ( evt, data, consumable ) => {
				consumable.consume( data.input, { name: true } );
			}, { priority: 'highest' } );

			editor.setData( '<ul><li></li></ul>' );

			expect( getModelData( modelDoc, { withoutSelection: true } ) ).to.equal( '' );
		} );

		it( 'view ul converter should not fire if change was already consumed', () => {
			editor.data.viewToModel.on( 'element:ul', ( evt, data, consumable ) => {
				consumable.consume( data.input, { name: true } );
			}, { priority: 'highest' } );

			editor.setData( '<ul><li></li></ul>' );

			expect( getModelData( modelDoc, { withoutSelection: true } ) ).to.equal( '' );
		} );
	} );

	function getViewPosition( root, path ) {
		let parent = root;

		while ( path.length > 1 ) {
			parent = parent.getChild( path.shift() );
		}

		return new ViewPosition( parent, path[ 0 ] );
	}

	function getViewPath( position ) {
		let path = [ position.offset ];
		let parent = position.parent;

		while ( parent.parent ) {
			path.unshift( parent.index );
			parent = parent.parent;
		}

		return path;
	}

	function testInsert( testName, input, output, testUndo = true ) {
		// Cut out inserted element that is between '[' and ']' characters.
		const selStart = input.indexOf( '[' ) + 1;
		const selEnd = input.indexOf( ']' );

		const item = input.substring( selStart, selEnd );
		const model = input.substring( 0, selStart ) + input.substring( selEnd );

		const actionCallback = () => {
			modelDoc.enqueueChanges( () => {
				modelDoc.batch().insert( modelDoc.selection.getFirstPosition(), parseModel( item, modelDoc.schema ) );
			} );
		};

		_test( testName, model, output, actionCallback, testUndo );
	}

	function testRemove( testName, input, output ) {
		const actionCallback = () => {
			modelDoc.enqueueChanges( () => {
				modelDoc.batch().remove( modelDoc.selection.getFirstRange() );
			} );
		};

		_test( testName, input, output, actionCallback );
	}

	function testChangeType( testName, input, output ) {
		const actionCallback = () => {
			const element = modelDoc.selection.getFirstPosition().nodeAfter;
			const newType = element.getAttribute( 'type' ) == 'numbered' ? 'bulleted' : 'numbered';

			modelDoc.enqueueChanges( () => {
				modelDoc.batch().setAttribute( modelDoc.selection.getFirstRange(), 'type', newType );
			} );
		};

		_test( testName, input, output, actionCallback );
	}

	function testRenameFromListItem( testName, input, output, testUndo = true ) {
		const actionCallback = () => {
			const element = modelDoc.selection.getFirstPosition().nodeAfter;

			modelDoc.enqueueChanges( () => {
				modelDoc.batch()
					.rename( element, 'paragraph' )
					.removeAttribute( element, 'type' )
					.removeAttribute( element, 'indent' );
			} );
		};

		_test( testName, input, output, actionCallback, testUndo );
	}

	function testRenameToListItem( testName, newIndent, input, output ) {
		const actionCallback = () => {
			const element = modelDoc.selection.getFirstPosition().nodeAfter;

			modelDoc.enqueueChanges( () => {
				modelDoc.batch()
					.setAttribute( element, 'type', 'bulleted' )
					.setAttribute( element, 'indent', newIndent )
					.rename( element, 'listItem' );
			} );
		};

		_test( testName, input, output, actionCallback );
	}

	function testChangeIndent( testName, newIndent, input, output ) {
		const actionCallback = () => {
			modelDoc.enqueueChanges( () => {
				modelDoc.batch().setAttribute( modelDoc.selection.getFirstRange(), 'indent', newIndent );
			} );
		};

		_test( testName, input, output, actionCallback );
	}

	function testMove( testName, input, rootOffset, output, testUndo = true ) {
		const actionCallback = () => {
			const targetPosition = ModelPosition.createAt( modelRoot, rootOffset );

			modelDoc.enqueueChanges( () => {
				modelDoc.batch().move( modelDoc.selection.getFirstRange(), targetPosition );
			} );
		};

		_test( testName, input, output, actionCallback, testUndo );
	}

	function _test( testName, input, output, actionCallback, testUndo = true ) {
		it( testName, () => {
			setModelData( modelDoc, input );

			actionCallback();

			expect( getViewData( viewDoc, { withoutSelection: true } ) ).to.equal( output );
		} );

		const undoTestFunction = testUndo ? it : it.skip;

		undoTestFunction( testName + ' (undo integration)', () => {
			setModelData( modelDoc, input );

			const modelBefore = input;
			const viewBefore = getViewData( viewDoc, { withoutSelection: true } );

			actionCallback();

			const modelAfter = getModelData( modelDoc );
			const viewAfter = getViewData( viewDoc, { withoutSelection: true } );

			editor.execute( 'undo' );

			expect( getModelData( modelDoc ) ).to.equal( modelBefore );
			expect( getViewData( viewDoc, { withoutSelection: true } ) ).to.equal( viewBefore );

			editor.execute( 'redo' );

			expect( getModelData( modelDoc ) ).to.equal( modelAfter );
			expect( getViewData( viewDoc, { withoutSelection: true } ) ).to.equal( viewAfter );
		} );
	}
} );
