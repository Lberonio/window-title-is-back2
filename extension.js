//    Window Title Is Back
//    GNOME Shell extension
//    @fthx 2025
//    @lberonio


import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Gio from 'gi://Gio';

import {AppMenu} from 'resource:///org/gnome/shell/ui/appMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';


const WindowTitleIndicator = GObject.registerClass(
class WindowTitleIndicator extends PanelMenu.Button {
    static match_app_name_for_title = String.raw`^(.*?)(\s?(-|—)\s?app_name\s?\w?\s?((\w{0,4}\.){0,3}\d\w?)?)$`;
    
    _init(settings) {
    super._init();

    this._settings = settings;

    this._menu = new AppMenu(this);
    this.setMenu(this._menu);
    this._menu.setSourceAlignment(0.3);
    Main.panel.menuManager.addMenu(this._menu);

    this._desaturate_effect = new Clutter.DesaturateEffect();

    // One box layout only — with GNOME's native spacing
    this._box = new St.BoxLayout({
        style_class: 'panel-button',
        spacing: 6, // ~GNOME default
        y_align: Clutter.ActorAlign.CENTER,
    });

    this._icon = new St.Icon({});
    this._icon.set_fallback_gicon(null);
    this._box.add_child(this._icon);

    this._app = new St.Label({
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'panel-label',
    });
    this._box.add_child(this._app);
    this._set_window_app_style();

    this._title = new St.Label({y_align: Clutter.ActorAlign.CENTER});
    this._box.add_child(this._title);

    this.add_child(this._box);

    global.display.connectObject('notify::focus-window', this._on_focused_window_changed.bind(this), this);
    St.TextureCache.get_default().connectObject('icon-theme-changed', this._on_focused_window_changed.bind(this), this);
}

    _fade_in() {
        this.remove_all_transitions();

        this.ease({
            opacity: 255,
            duration: this._ease_time ,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this.show(),
        });
    }

    _fade_out() {
        this.remove_all_transitions();

        this.ease({
            opacity: 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            duration: this._ease_time,
            onComplete: () => this.hide(),
        });
    }

    _sync() {
        this.remove_all_transitions();

        this.ease({
            opacity: 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            duration: this._ease_time,
            onComplete: () => {
                this._set_window_app();
                this._set_window_title();
                this._fade_in();
            },
        });
    }

    _on_focused_window_changed() {
    if (Main.sessionMode.isLocked)
        return;

    // Disconnect old signal if any
    if (this._focused_window)
        this._focused_window.disconnectObject(this);

    this._focused_window = global.display.get_focus_window();

    // No window focused → show Desktop state
    if (!this._focused_window) {
        this._set_desktop_state();
        return;
    }

    // Skip windows hidden from taskbar unless modal dialogs
    const isVisibleWindow =
        !this._focused_window.skip_taskbar ||
        this._focused_window.get_window_type() == Meta.WindowType.MODAL_DIALOG;

    if (!isVisibleWindow) {
        this._set_desktop_state();
        return;
    }

    // Real app focused
    this._set_window_app();
    this._set_window_title();

    // Restore menu for real app
    this.menu.setApp(this._focused_app);

    // Update title dynamically if enabled
    if (this._settings.get_boolean('show-title'))
        this._focused_window.connectObject('notify::title', this._set_window_title.bind(this), this);

    this.show();
    this.opacity = 255;
}

    _set_window_app() {
        this._focused_app = this._get_focused_app();

        if (this._focused_app) {
            this._icon.set_gicon(this._focused_app.get_icon());
            this._app.set_text(this._focused_app.get_name());

            this.menu.setApp(this._focused_app);
        }
    }

    _set_window_app_style() {
    this._app.style = "font-weight: bold;";
}

    _set_window_title() {
        if (this._focused_window)
            this._title.set_text(this._get_window_title());
    }

    _get_window_title() {
        const app_name = this._get_focused_app_name();
        const window_title = this._focused_window.get_title();
        if (!app_name) {
            return window_title;
        }
        const match_string = WindowTitleIndicator.match_app_name_for_title.replace("app_name", app_name);
        const matches = new RegExp(match_string, "gm").exec(window_title);
        if (matches) {
            return matches[1];
        }
        return window_title;
    }

    _get_focused_app() {
        return Shell.WindowTracker.get_default().get_window_app(this._focused_window);
    }

    _get_focused_app_name() {
        this._focused_app = this._get_focused_app();

        if (this._focused_app) {
            return this._focused_app.get_name();
        }
        return null;
    }

    _set_desktop_state() {
    this._focused_app = null;
    this._focused_window = null;

    const showIcon = this._settings.get_boolean('show-icon');
    const showApp = this._settings.get_boolean('show-app');

    // Icon
    if (showIcon)
        this._icon.set_gicon(Gio.icon_new_for_string('user-desktop-symbolic'));
    else
        this._icon.set_gicon(null);
    this._icon.visible = showIcon;

    // App label
    if (showApp)
        this._app.set_text('Desktop');
    else
        this._app.set_text('');
    this._app.visible = showApp;

    // Clear the window title
    this._title.set_text('');
    this._title.visible = false;

    // Padding
    this._icon_padding.set_text(showIcon ? '   ' : '');
    this._app_padding.set_text('');

    // Make indicator clickable, but disable menu
    this.menu.setApp(null);         // clears menu, so nothing shows when clicked
    this.menu._app = null;          // also clear internal reference

    this.show();
    this.opacity = 255;
}

    _destroy() {
        global.display.disconnectObject(this);
        St.TextureCache.get_default().disconnectObject(this);

        if (this._focused_window)
            this._focused_window.disconnectObject(this);
        this._focused_window = null;
        this._focused_app = null;

        Main.panel.menuManager.removeMenu(this.menu);
        this.menu = null;

        super.destroy();
    }
});

export default class WindowTitleIsBackExtension extends Extension {
    _on_settings_changed() {
        this._indicator._icon.visible = this._settings.get_boolean('show-icon');
        this._indicator._app.visible = this._settings.get_boolean('show-app');
        this._indicator._title.visible = this._settings.get_boolean('show-title');
        this._indicator._ease_time = this._settings.get_int('ease-time');

        if (this._settings.get_boolean('show-icon'))
            this._indicator._icon_padding.set_text('   ');
        else
            this._indicator._icon_padding.set_text('');

        if (this._settings.get_boolean('show-app') && this._settings.get_boolean('show-title'))
            this._indicator._app_padding.set_text('   ');
        else
            this._indicator._app_padding.set_text('');
        this._indicator._set_window_app_style();

        if (this._settings.get_boolean('colored-icon')) {
            this._indicator._icon.set_style_class_name('');
            this._indicator.remove_effect(this._indicator._desaturate_effect);
        } else {
            this._indicator._icon.set_style_class_name('app-menu-icon');
            this._indicator.add_effect(this._indicator._desaturate_effect);
        }

        this._indicator._icon.set_icon_size(this._settings.get_int('icon-size'));

        if (this._settings.get_boolean('fixed-width'))
            this._indicator.set_width(Main.panel.width * this._settings.get_int('indicator-width') * 0.004);
        else
            this._indicator.set_width(-1);

        this._indicator._on_focused_window_changed();
    }

    enable() {
        this._settings = this.getSettings();

        this._indicator = new WindowTitleIndicator(this._settings);

        this._on_settings_changed();
        this._settings.connectObject('changed', this._on_settings_changed.bind(this), this);

        Main.panel.addToStatusArea('focused-window-indicator', this._indicator, -1, 'left');
    }

    disable() {
        this._settings.disconnectObject(this);
        this._settings = null;

        this._indicator._destroy();
        this._indicator = null;
    }
}
