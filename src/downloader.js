/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, brackets */

/**
* Link File Downloader
*/
define(function Downloader(require, exports, module) {
    'use strict';

    var Dialogs             = brackets.getModule("widgets/Dialogs"),
        FileUtils           = brackets.getModule("file/FileUtils"),
        ProjectManager      = brackets.getModule("project/ProjectManager"),
        FileSystem          = brackets.getModule("filesystem/FileSystem"),
        LanguageManager     = brackets.getModule("language/LanguageManager"),
        Mustache            = brackets.getModule("thirdparty/mustache/mustache");

    var Linker              = require("./linker"),
        CdnManager          = require("./cdnManager"),
        Strings             = require("strings");

    var HeaderTemplate      = require("text!templates/cdnLibsHeader.html"),
        LibsTemplate        = require("text!templates/cdnLibsList.html"),
        LibTemplate         = require("text!templates/cdnLibsListItem.html"),
        VersionTemplate     = require("text!templates/cdnLibVersionLink.html"),
        FileTemplate        = require("text!templates/cdnLibFileLink.html"),
        DirTemplate         = require("text!templates/cdnLibFileDir.html"),
        DescriptionTemplate = require("text!templates/cdnLibDescription.html"),
        NavBar              = require("text!templates/cdnNavBar.html");


    var moduleDirPath = FileUtils.getNativeModuleDirectoryPath(module);

    /**
     * Returns the list of available libraries.
     * @private
     * @returns {object} A promise with an array of lib objects on success.
     */
    function _getLibraryFirstPage() {
        var deferred = new $.Deferred();

        if (CdnManager.getCurrentLibs().length === 0) {
            CdnManager.fetchPage(1).done(function () {
                deferred.resolve(CdnManager.getCurrentLibs());
            }).fail(function () {
                deferred.reject();
            });
        } else {
            // To let the loading message appear in the dialog.
            setTimeout(function () {
                deferred.resolve(CdnManager.getCurrentLibs());
            }, 300);
        }
        return deferred.promise();
    }

    /**
     * Creates the library list HTML to be displayed in a dialog.
     * @private
     * @param   {Array}  libs Array of library objects.
     * @returns {string} Library list HTML.
     */
    function _renderLibraries(libs) {
        var iconsDir = moduleDirPath + "/../styles/icons/",
            downloadIconPath = iconsDir + "ionicons-download.png",
            linkIconPath = iconsDir + "ionicons-link.png",
            navIconPath = iconsDir + "ionicons-navicon-round.png",
            filesIconPath = iconsDir + "ionicons-document-text.png";

        var listItems = "";
        for (var i = 0; i < libs.length; i++) {

            listItems += Mustache.render(LibTemplate, {
                libName: libs[i].name,
                hits: libs[i].hits,
                libFile: "Select file",
                libVersion: "Select version",
                lastVersionLabel: Strings.CDN_LAST_VERSION,
                downloadIconPath: downloadIconPath,
                linkIconPath: linkIconPath,
                navIconPath: navIconPath,
                filesIconPath: filesIconPath
            });
        }
        return Mustache.render(LibsTemplate, { listItems: listItems });
    }

    /**
     * Creates the versions list HTML to be displayed for a library.
     * @private
     * @param   {object} $lib JQuery object containing the 'li' of the library.
     * @returns {string} Versions HTML.
     */
    function _renderVersions(libName, versionsObj) {
        var rendered = "<h4><u>Versions</u></h4>";

        for (var i = 0; i < versionsObj.versions.length; i++) {
            rendered += Mustache.render(VersionTemplate, { version: versionsObj.versions[i] });
        }
        return rendered;
    }

    /**
     * Creates the files list HTML to be displayed for a library.
     * @private
     * @param   {object} $lib JQuery object containing the library 'li' element.
     * @returns {object} Promise with the files HTML string on success.
     */
    function _renderFiles(filesObj) {
        var rendered = "<h4><u>Files</u></h4>", depth = 0, currentPath = [], indent = "",
            dirIconPath = moduleDirPath + "/../styles/icons/ionicons-folder.png"

        var scan = function (files) {
            files.forEach(function (fileObj, index, array) {
                var qfileName, fileName, lastSlash;

                for (var i = 0; i < depth; i++) {
                    indent += "&nbsp&nbsp&nbsp&nbsp";
                }

                if (fileObj.type === "file") {
                    fileName = fileObj.name;
                    if (currentPath.length > 0) {
                        lastSlash = "/";
                    } else {
                        lastSlash = "";
                    }
                    qfileName = "/" + currentPath.join("/") + lastSlash + fileName;
                    rendered += Mustache.render(
                        FileTemplate,
                        {
                            indent: indent,
                            qfile: qfileName,
                            file: fileName
                        }
                    );
                    indent = "";
                } else if (fileObj.type === "directory") {
                    fileName = fileObj.name;
                    rendered += Mustache.render(
                        DirTemplate,
                        {
                            indent: indent,
                            dirIconPath: dirIconPath,
                            file: fileName
                        }
                    );
                    depth += 1;
                    indent = "";
                    currentPath.push(fileName);
                    scan(fileObj.files);
                }
                if (index === array.length - 1 && depth > 0) {
                    depth -= 1;
                    currentPath.pop();
                }
            });
        };
        scan(filesObj.files);
        return rendered;
    }

    function _renderDescription(libName) {
        var deferred = new $.Deferred(),
            rendered;

        CdnManager.fetchLibDescription(libName).done(function (descObj) {
            rendered = Mustache.render(
                DescriptionTemplate,
                {
                    libDescription: descObj.description,
                    libAuthor: descObj.author,
                    libHomepage: descObj.homepage,
                    libGithub: descObj.github
                }
            );
            deferred.resolve(rendered);
        }).fail(function () {
            deferred.resolve("No Description");
        });
        return deferred.promise();
    }

    function _updateLibList(destDirPath) {
        $(".modal-body").empty();
        $(".modal-body").html(_renderLibraries(CdnManager.getCurrentLibs()));
        $(".modal-footer").find("#blf-cdn-current-page").text(CdnManager.getCurrentPage());
        _enableLibHandlers(destDirPath);
    }

    function _enableNavBar(destDirPath) {
        var backIconPath = moduleDirPath + "/../styles/icons/ionicons-arrow-back.png",
            forwardIconPath = moduleDirPath + "/../styles/icons/ionicons-arrow-forward.png",
            $navBar = $(Mustache.render(NavBar, {
                backIconPath: backIconPath,
                currentPage: CdnManager.getCurrentPage(),
                forwardIconPath: forwardIconPath
            }));

        $(".modal-footer").prepend($navBar);
        $navBar.css({
            "position": "absolute",
            "left": "10px",
            "bottom": "10px"
        });

        // Navbar buttons handlers
        $navBar.find("#blf-back").click(function () {
            $(".modal-body").empty();
            $(".modal-body").html("<h4>" + Strings.CDN_LOADING + "</h4>");
            CdnManager.fetchPreviousPage().done(function () {
                _updateLibList(destDirPath);
            });
        });
        $navBar.find("#blf-forward").click(function () {
            $(".modal-body").empty();
            $(".modal-body").html("<h4>" + Strings.CDN_LOADING + "</h4>");
            CdnManager.fetchNextPage().done(function () {
                _updateLibList(destDirPath);
            });
        });
    }

    function _doDownloadOrLink(libObject, destDirPath) {
        if (destDirPath) {
            CdnManager.fetchFileContent(libObject.url).done(function (libContent) {
                var libFile = FileSystem.getFileForPath(destDirPath + libObject.file);

                FileUtils.writeText(libFile, libContent, true).done(function () {
                    var tag = Linker.getTagsFromFiles([libFile.fullPath]);
                    Linker.insertTags(tag);
                    ProjectManager.refreshFileTree();
                }).fail(function () {
                    console.log("Error writing file: " + libFile.fullPath);
                });
            });
        } else {
            var tag = Linker.getTagsFromUrls([libObject.url]);
            Linker.insertTags(tag);
        }
    }

    function _filterBoxHandler() {
        $(".blf-filterinput").keyup(function () {
            var filter = $(this).val().toLowerCase();
            if (filter) {
                $("#blf-libs").find("li").each(function (i, li) {
                    var id = li.id.toLowerCase();
                    if (id.search(filter) === -1) {
                        $(li).hide();
                    } else {
                        $(li).show();
                    }
                });
            } else {
                $("#blf-libs").find("li").show();
            }
        });
    }

    function _descriptionButtonsHandler() {
        $(".blf-lib-desc-link").click(function (ev) {
            ev.preventDefault();
            ev.stopPropagation();

            var $libDiv = $(this).parent().parent().parent(),
                $decriptionDiv = $libDiv.find(".blf-lib-description"),
                libName = $(this).text();

            if ($decriptionDiv.is(":visible")) {
                $decriptionDiv.empty();
                $decriptionDiv.hide();
            } else {
                _renderDescription(libName).done(function (description) {
                    $decriptionDiv.html(description);
                    $decriptionDiv.show();
                });
            }
        });
    }

    function _versionsButtonsHandler() {
        $(".blf-btn-versions").click(function () {
            var $li = $(this).parent().parent().parent(),
                libName = $li.attr("id"),
                $versionsDiv = $li.find(".blf-lib-versions"),
                $selectedVersion = $li.find(".blf-lib-version"),
                $filesDiv = $li.find(".blf-lib-files"),
                $selectedFile = $li.find(".blf-lib-file"),
                latestVersion = "";

            if ($versionsDiv.is(":visible")) {
                $versionsDiv.empty();
                $versionsDiv.hide();
            } else {
                // Hide files if visible.
                if ($filesDiv.is(":visible")) {
                    $filesDiv.empty();
                    $filesDiv.hide();
                }

                CdnManager.fetchLibVersions(libName).done(function (versionsObj) {
                    $versionsDiv.html(_renderVersions(libName, versionsObj));
                    $versionsDiv.show();
                    if ($selectedVersion.text() === "(Select version)") {
                        if (versionsObj.tags.latest) {
                            latestVersion = versionsObj.tags.latest;
                        } else {
                            latestVersion = versionsObj.versions[0];
                        }
                        $selectedVersion.text("(" + latestVersion + ")");
                        $li.find("span.blf-lib-last-version").text(Strings.CDN_LAST_VERSION + latestVersion);
                        CdnManager.fetchLibFiles(libName, latestVersion).done(function (filesObj) {
                            if (filesObj.default) {
                                $selectedFile.text("(" + FileUtils.getBaseName(filesObj.default) + ")");
                                $selectedFile.data("qfile", filesObj.default);
                            }
                        });
                    }

                    // Version links handler.
                    $(".blf-version-link").click(function (ev) {
                        var $libDiv, $lastVersionEl, lastVersion,
                            fileExt, version = $(this).text();

                        ev.preventDefault();

                        $libDiv = $(this).parent().parent().prev();
                        $lastVersionEl = $libDiv.find("span.blf-lib-last-version");
                        lastVersion = $lastVersionEl.text().replace(Strings.CDN_LAST_VERSION, "");
                        if (version === lastVersion) {
                            $lastVersionEl.hide();
                        } else {
                            $lastVersionEl.show();
                        }
                        $libDiv.find("span.blf-lib-version").text("(" + $(this).text() + ")");
                        $libDiv.next().hide();

                        // Reset files.
                        CdnManager.fetchLibFiles(libName, version).done(function (filesObj) {
                            if (filesObj.default) {
                                $selectedFile.text("(" + FileUtils.getBaseName(filesObj.default) + ")");
                                $selectedFile.data("qfile", filesObj.default);
                                fileExt = FileUtils.getFileExtension(filesObj.default.toLowerCase());
                                if (fileExt === "js" || fileExt === "css") {
                                    $libDiv.find(".blf-btn-download").show();
                                } else {
                                    $libDiv.find(".blf-btn-download").hide();
                                }
                            } else {
                                $selectedFile.text("(Select file)");
                                $selectedFile.data("qfile", "");
                            }
                        });
                    });
                }).fail(function () {
                    console.log("Unable to fetch `" + libName + "` version list");
                });
            }
        });
    }

    function _downloadButtonsHandler(destDirPath) {
        $(".blf-btn-download").click(function () {
            var libName, libFile, version, libObject,
                $li = $(this).parent().parent().parent();

            libName = $li.attr("id");
            libFile = $li.find(".blf-lib-file").data("qfile");
            version = $li.find(".blf-lib-version").text().replace(/[()]/g, "");
            CdnManager.createUrl(libName, version, libFile).done(function (url) {
                libObject = {
                    url: url,
                    file: FileUtils.getBaseName(libFile)
                };
                _doDownloadOrLink(libObject, destDirPath);
            }).fail(function () {
                console.log("Cannot create URL");
            });
        });
    }

    function _linkButtonsHandler() {
        $(".blf-btn-link").click(function () {
            var libName, libFile, version, libObject,
                $li = $(this).parent().parent().parent();

            libName = $li.attr("id");
            libFile = $li.find(".blf-lib-file").data("qfile");
            version = $li.find(".blf-lib-version").text().replace(/[()]/g, "");
            CdnManager.createUrl(libName, version, libFile).done(function (url) {
                libObject = {
                    url: url
                };
                _doDownloadOrLink(libObject);
            }).fail(function () {
                console.log("Cannot create URL");
            });
        });
    }

    function _filesButtonsHandler() {
        $(".blf-btn-files").click(function () {
            var $li = $(this).parent().parent().parent(),
                $filesDiv = $li.find(".blf-lib-files"),
                $versionsDiv = $li.find(".blf-lib-versions"),
                $selectedFile = $li.find(".blf-lib-file"),
                libName = $li.attr("id"),
                version = $li.find("span.blf-lib-version").text().replace(/[()]/g, "");

            if ($filesDiv.is(":visible")) {
                $filesDiv.empty();
                $filesDiv.hide();
            } else {
                // Hide versions if visible.
                if ($versionsDiv.is(":visible")) {
                    $versionsDiv.empty();
                    $versionsDiv.hide();
                }

                var _filesFunc = function () {
                    CdnManager.fetchLibFiles(libName, version).done(function (filesObj) {
                        $filesDiv.html(_renderFiles(filesObj));
                        $filesDiv.show();

                        if ($selectedFile.text() === "(Select file)" && filesObj.default) {
                            $selectedFile.text("(" + FileUtils.getBaseName(filesObj.default) + ")");
                            $selectedFile.data("qfile", filesObj.default);
                        }

                        // Files links handler.
                        $(".blf-file-link").click(function (ev) {
                            var $libDiv, qLibFile, fileExt;

                            ev.preventDefault();

                            $libDiv = $(this).parent().parent().prev().prev();
                            $libDiv.next().next().hide();
                            qLibFile = $(this).data("qfile");
                            $selectedFile.data("qfile", qLibFile);
                            $selectedFile.text("(" + $(this).text() + ")");

                            fileExt = FileUtils.getFileExtension(qLibFile.toLowerCase());
                            if (fileExt === "js" || fileExt === "css") {
                                $libDiv.find(".blf-btn-download").show();
                            } else {
                                $libDiv.find(".blf-btn-download").hide();
                            }
                        });
                    });
                };

                if (version === "Select version") {
                    CdnManager.fetchLibVersions(libName).done(function (versionsObj) {
                        if (versionsObj.tags.latest) {
                            version = versionsObj.tags.latest;
                        } else {
                            version = versionsObj.versions[0];
                        }
                        $li.find("span.blf-lib-version").text("(" + version + ")");
                        $li.find("span.blf-lib-last-version").text(Strings.CDN_LAST_VERSION + version);
                        _filesFunc();
                    });
                } else {
                    _filesFunc();
                }
            }
        });
    }

    function _enableLibHandlers(destDirPath) {
        _filterBoxHandler();
        _descriptionButtonsHandler();
        _versionsButtonsHandler();
        _downloadButtonsHandler(destDirPath);
        _linkButtonsHandler();
        _filesButtonsHandler();
    }

    /**
     * Shows the library selection dialog.
     * @private
     */
    function init() {
        var listDialog, libObject, btnCancel, destDirPath,
            projectItem = ProjectManager.getSelectedItem();

        if (projectItem.isDirectory) {
            destDirPath = projectItem.fullPath;
        } else {
            destDirPath = ProjectManager.getProjectRoot().fullPath;
        }

        listDialog = Dialogs.showModalDialog(
            brackets.DIALOG_ID_SAVE_CLOSE,
            Mustache.render(HeaderTemplate, {
                title: Strings.CDN_HEADER_TITLE,
                placeholder: Strings.CDN_HEADER_PLACEHOLDER
            }),
            "<h4>" + Strings.CDN_LOADING + "</h4>",
            [{
                className: Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                id: "blf.cancel",
                text: Strings.CANCEL_BUTTON
            }],
            false
        );
        // Ensure that the dialog height is always the same.
        $(".modal-body").css("height", "400px");

        // Cancel button handler.
        btnCancel = $('.dialog-button').filter('[data-button-id="blf.cancel"]');
        btnCancel.click(function () {
            listDialog.close();
        });

        // Fetch the library list.
        _getLibraryFirstPage().done(function (libs) {
            $(".modal-body").html(_renderLibraries(libs));

            // Enable page navigation
            _enableNavBar(destDirPath);

            // Enable library handlers.
            _enableLibHandlers(destDirPath);

            // Ensure that descriptions, versions and files are hidden when open the dialog.
            $("#blf-libs").find(".blf-lib-description").hide();
            $("#blf-libs").find(".blf-lib-versions").hide();
            $("#blf-libs").find(".blf-lib-files").hide();

            // Bootstrap and JQuery downloads causes a Brackets crash, because of some
            // kind of colision. I could not find a solution for now, so I have opted to cancel the download.
            $("#blf-libs").find("#jquery").find(".blf-btn-download").remove();
            $("#blf-libs").find("#bootstrap").find(".blf-btn-download").remove();
        }).fail(function () {
            $(".modal-body").html("<h4>" + Strings.CDN_ERROR_FETCHING_LIST + "</h4>");
        });
    }

    module.exports = {
        init: init
    }
});
