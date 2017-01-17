'use strict';

const common = {};
module.exports = common;

// Forward an event from one EventEmitter to another
//   from - EventEmitter to listen for event
//   to - EventEmitter to emit event on
//   eventName - name of the event
//   newEventName - name of the forwarded event (optional)
//
common.forwardEvent = (from, to, eventName, newEventName = eventName) => {
  from.on(eventName, (eventArgs) => {
    to.emit(newEventName, eventArgs, to);
  });
};

// Forward events from one EventEmitter to another
//   from - EventEmitter to listen for event
//   to - EventEmitter to emit event on
//   eventNames - array of names of events
//
common.forwardMultipleEvents = (from, to, eventNames) => {
  eventNames.forEach((event) => {
    common.forwardEvent(from, to, event);
  });
};