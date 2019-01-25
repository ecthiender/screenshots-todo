/* globals global, documentMetadata, util, uicontrol, ui, catcher */
/* globals buildSettings, domainFromUrl, randomString, shot, blobConverters, makeUuid */

GQL_URL = 'https://hackasura-av.herokuapp.com/v1alpha1/graphql';

TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6Ik16QXdSRGxCUTBNelF6VXpSRE0wUVVSRk1ETXpNRE0zUkVJek9UazVOelkzUlRsRU9UZERSUSJ9.eyJodHRwczovL2hhc3VyYS5pby9qd3QvY2xhaW1zIjp7IngtaGFzdXJhLWRlZmF1bHQtcm9sZSI6InVzZXIiLCJ4LWhhc3VyYS1hbGxvd2VkLXJvbGVzIjpbInVzZXIiXSwieC1oYXN1cmEtdXNlci1pZCI6ImF1dGgwfDVjNGFmNzBmNTE3OWRlMGMwODEwMjc4OCJ9LCJuaWNrbmFtZSI6InZhbXNoaSIsIm5hbWUiOiJ2YW1zaGlAaGFzdXJhLmlvIiwicGljdHVyZSI6Imh0dHBzOi8vcy5ncmF2YXRhci5jb20vYXZhdGFyLzUwOWVmN2RjYTk4ZDczZTExNDc4ZDc3MGRjODVmMmRkP3M9NDgwJnI9cGcmZD1odHRwcyUzQSUyRiUyRmNkbi5hdXRoMC5jb20lMkZhdmF0YXJzJTJGdmEucG5nIiwidXBkYXRlZF9hdCI6IjIwMTktMDEtMjVUMTI6MDI6MDIuMTA0WiIsImlzcyI6Imh0dHBzOi8vaGFja2FzdXJhLWF2LmV1LmF1dGgwLmNvbS8iLCJzdWIiOiJhdXRoMHw1YzRhZjcwZjUxNzlkZTBjMDgxMDI3ODgiLCJhdWQiOiJTaENUM2VOUEdUM0FHbjdBMDdKVHhiRzBjU1FaRXF4MCIsImlhdCI6MTU0ODQxNzcyMiwiZXhwIjoxNTQ4NDUzNzIyLCJhdF9oYXNoIjoib0J1U1BzX3RJMDVJWWU5QlpNZi1IZyIsIm5vbmNlIjoiUVhCSjhZVjFLS3ctb3VYRE13cGZOSEcwaVFrdDdmWmgifQ.UpcgYfJa6A7gT6SXw0FJOWCROEgWoL5iPCFOMSEAXE8Z7N36tO2Er6LbrGz5qROjcmUSg0GoFs3AEeRdBDyJ_4bf1psD6bwCJsZcGSYGY1kH7OFglJe2BxL2c4T_D5PFmAOgkV3ft5XVRQqk-16bQhcePA7R40vtQRfEqJOtixtMtrTy3xp5Y8UwZOOikIbR1H1pYAwQm8Uaag9ctfqPOIJKeb5x9OmfTo_N7Rw3sd9PPX-En4zlTmVTtQSTodHxq5pK22_Cy5ATSMfxZRX-5LDSEYLGZYuyeQNbLZ0-tsBPO42YGD-7H1TizlJG233yKwOxFPxcAS0SvqtLHlKb5Q';


"use strict";

this.shooter = (function() { // eslint-disable-line no-unused-vars
  const exports = {};
  const { AbstractShot } = shot;

  const RANDOM_STRING_LENGTH = 16;
  const MAX_CANVAS_DIMENSION = 32767;
  let backend;
  let shotObject;
  let supportsDrawWindow;
  const callBackground = global.callBackground;
  const clipboard = global.clipboard;

  function regexpEscape(str) {
    // http://stackoverflow.com/questions/3115150/how-to-escape-regular-expression-special-characters-using-javascript
    return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
  }

  function sanitizeError(data) {
    const href = new RegExp(regexpEscape(window.location.href), "g");
    const origin = new RegExp(`${regexpEscape(window.location.origin)}[^ \t\n\r",>]*`, "g");
    const json = JSON.stringify(data)
      .replace(href, "REDACTED_HREF")
      .replace(origin, "REDACTED_URL");
    const result = JSON.parse(json);
    return result;
  }

  catcher.registerHandler((errorObj) => {
    callBackground("reportError", sanitizeError(errorObj));
  });

  catcher.watchFunction(() => {
    const canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
    const ctx = canvas.getContext("2d");
    supportsDrawWindow = !!ctx.drawWindow;
  })();

  function captureToCanvas(selectedPos, captureType) {
    let height = selectedPos.bottom - selectedPos.top;
    let width = selectedPos.right - selectedPos.left;
    const canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
    const ctx = canvas.getContext("2d");

    // Scale the canvas for high-density displays, except for full-page shots.
    let expand = window.devicePixelRatio !== 1;
    if (captureType === "fullPage" || captureType === "fullPageTruncated") {
      expand = false;
      canvas.width = width;
      canvas.height = height;
    } else {
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
    }
    if (expand) {
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    // Double-check canvas width and height are within the canvas pixel limit.
    // If the canvas dimensions are too great, crop the canvas and also crop
    // the selection by a devicePixelRatio-scaled amount.
    if (canvas.width > MAX_CANVAS_DIMENSION) {
      canvas.width = MAX_CANVAS_DIMENSION;
      width = expand ? Math.floor(canvas.width / window.devicePixelRatio) : canvas.width;
    }
    if (canvas.height > MAX_CANVAS_DIMENSION) {
      canvas.height = MAX_CANVAS_DIMENSION;
      height = expand ? Math.floor(canvas.height / window.devicePixelRatio) : canvas.height;
    }

    ui.iframe.hide();
    ctx.drawWindow(window, selectedPos.left, selectedPos.top, width, height, "#fff");
    return canvas;
  }

  const screenshotPage = exports.screenshotPage = function(selectedPos, captureType) {
    if (!supportsDrawWindow) {
      return null;
    }
    const canvas = captureToCanvas(selectedPos, captureType);
    const limit = buildSettings.pngToJpegCutoff;
    let dataUrl = canvas.toDataURL();
    if (limit && dataUrl.length > limit) {
      const jpegDataUrl = canvas.toDataURL("image/jpeg");
      if (jpegDataUrl.length < dataUrl.length) {
        // Only use the JPEG if it is actually smaller
        dataUrl = jpegDataUrl;
      }
    }
    return dataUrl;
  };

  function screenshotPageAsync(selectedPos, captureType) {
    if (!supportsDrawWindow) {
      return Promise.resolve(null);
    }
    const canvas = captureToCanvas(selectedPos, captureType);
    ui.iframe.showLoader();
    const imageData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    return callBackground("canvasToDataURL", imageData);
  }

  let isSaving = null;

  exports.takeShot = function(captureType, selectedPos, url) {
    // isSaving indicates we're aleady in the middle of saving
    // we use a timeout so in the case of a failure the button will
    // still start working again
    if (Math.floor(selectedPos.left) === Math.floor(selectedPos.right) ||
        Math.floor(selectedPos.top) === Math.floor(selectedPos.bottom)) {
        const exc = new Error("Empty selection");
        exc.popupMessage = "EMPTY_SELECTION";
        exc.noReport = true;
        catcher.unhandled(exc);
        return;
    }
    let imageBlob;
    const uicontrol = global.uicontrol;
    let deactivateAfterFinish = true;
    if (isSaving) {
      return;
    }
    isSaving = setTimeout(() => {
      if (typeof ui !== "undefined") {
        // ui might disappear while the timer is running because the save succeeded
        ui.Box.clearSaveDisabled();
      }
      isSaving = null;
    }, 1000);
    selectedPos = selectedPos.toJSON();
    let captureText = "";
    if (buildSettings.captureText) {
      captureText = util.captureEnclosedText(selectedPos);
    }
    const dataUrl = url || screenshotPage(selectedPos, captureType);
    let type = blobConverters.getTypeFromDataUrl(dataUrl);
    type = type ? type.split("/", 2)[1] : null;
    if (dataUrl) {
      imageBlob = buildSettings.uploadBinary ? blobConverters.dataUrlToBlob(dataUrl) : null;
      shotObject.delAllClips();
      shotObject.addClip({
        createdDate: Date.now(),
        image: {
          url: buildSettings.uploadBinary ? "" : dataUrl,
          type,
          captureType,
          text: captureText,
          location: selectedPos,
          dimensions: {
            x: selectedPos.right - selectedPos.left,
            y: selectedPos.bottom - selectedPos.top,
          },
        },
      });
    }
    catcher.watchPromise(callBackground("takeShot", {
      captureType,
      captureText,
      scroll: {
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        innerHeight: window.innerHeight,
        innerWidth: window.innerWidth,
      },
      selectedPos,
      shotId: shotObject.id,
      shot: shotObject.toJSON(),
      imageBlob,
    }).then((url) => {
      return clipboard.copy(url).then((copied) => {
        return callBackground("openShot", { url, copied });
      });
    }, (error) => {
      if ("popupMessage" in error && (error.popupMessage === "REQUEST_ERROR" || error.popupMessage === "CONNECTION_ERROR")) {
        // The error has been signaled to the user, but unlike other errors (or
        // success) we should not abort the selection
        deactivateAfterFinish = false;
        // We need to unhide the UI since screenshotPage() hides it.
        ui.iframe.unhide();
        return;
      }
      if (error.name !== "BackgroundError") {
        // BackgroundError errors are reported in the Background page
        throw error;
      }
    }).then(() => {
      if (deactivateAfterFinish) {
        uicontrol.deactivate();
      }
    }));
  };

  const insertTodoQ = `
    mutation addTodo($text: String, $image: String, $isPublic: Boolean) {
      insert_todos(objects: [{
        text: $text,
        image: $image,
        is_public: $isPublic
      }]) {
        affected_rows
      }
    } `;

  const saveToHasura = (dataUrl, isPublic) => {
    const options = {
      method: 'POST',
      body: JSON.stringify({
        query: insertTodoQ,
        variables: {
          image: dataUrl,
          isPublic: isPublic
        }
      }),
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${TOKEN}`
      }
    };
    return window.fetch(GQL_URL, options)
      .then((resp) => resp.json());
  };

  exports.downloadShot = function(selectedPos, previewDataUrl, type, isNotePublic) {
    const shotPromise = previewDataUrl ? Promise.resolve(previewDataUrl) : screenshotPageAsync(selectedPos, type);
    catcher.watchPromise(shotPromise.then(dataUrl => {
      let promise = Promise.resolve(dataUrl);
      if (!dataUrl) {
        promise = callBackground(
          "screenshotPage",
          selectedPos.toJSON(),
          {
            scrollX: window.scrollX,
            scrollY: window.scrollY,
            innerHeight: window.innerHeight,
            innerWidth: window.innerWidth,
          });
      }
      catcher.watchPromise(promise.then((dataUrl) => {
        let type = blobConverters.getTypeFromDataUrl(dataUrl);
        type = type ? type.split("/", 2)[1] : null;
        shotObject.delAllClips();
        shotObject.addClip({
          createdDate: Date.now(),
          image: {
            url: dataUrl,
            type,
            location: selectedPos,
          },
        });
        saveToHasura(dataUrl, isNotePublic)
          .then((data) => {
            // ui.triggerDownload(dataUrl, shotObject.filename);
            console.log(data);
            uicontrol.deactivate();
            console.log(browser.notifications);
            browser.notifications.create(makeUuid(), {
              type: "basic",
              title: "Saved!",
              message: "Your note is saved"
            });
          });
      }));
    }));
  };

  let copyInProgress = null;
  exports.copyShot = function(selectedPos, previewDataUrl, type) {
    // This is pretty slow. We'll ignore additional user triggered copy events
    // while it is in progress.
    if (copyInProgress) {
      return;
    }
    // A max of five seconds in case some error occurs.
    copyInProgress = setTimeout(() => {
      copyInProgress = null;
    }, 5000);

    const unsetCopyInProgress = () => {
      if (copyInProgress) {
        clearTimeout(copyInProgress);
        copyInProgress = null;
      }
    };
    const shotPromise = previewDataUrl ? Promise.resolve(previewDataUrl) : screenshotPageAsync(selectedPos, type);
    catcher.watchPromise(shotPromise.then(dataUrl => {
      const blob = blobConverters.dataUrlToBlob(dataUrl);
      catcher.watchPromise(callBackground("copyShotToClipboard", blob).then(() => {
        uicontrol.deactivate();
        unsetCopyInProgress();
      }, unsetCopyInProgress));
    }));
  };

  exports.sendEvent = function(...args) {
    const maybeOptions = args[args.length - 1];

    if (typeof maybeOptions === "object") {
      maybeOptions.incognito = browser.extension.inIncognitoContext;
    } else {
      args.push({incognito: browser.extension.inIncognitoContext});
    }

    callBackground("sendEvent", ...args);
  };

  catcher.watchFunction(() => {
    shotObject = new AbstractShot(
      backend,
      randomString(RANDOM_STRING_LENGTH) + "/" + domainFromUrl(location),
      {
        origin: shot.originFromUrl(location.href),
      }
    );
    shotObject.update(documentMetadata());
  })();

  return exports;
})();
null;


