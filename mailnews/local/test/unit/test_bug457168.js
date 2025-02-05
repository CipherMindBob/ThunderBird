/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/**
 * Protocol tests for POP3.
 */

var server;
var daemon;
var incomingServer;
var thisTest;

var tests = [
  {
    title: "Get New Mail, One Message",
    messages: ["message2.eml", "message2.eml", "message3.eml"],
    transaction: [
      "AUTH",
      "CAPA",
      "AUTH PLAIN",
      "STAT",
      "LIST",
      "UIDL",
      "RETR 1",
      "DELE 1",
      "RETR 2",
      "DELE 2",
      "RETR 3",
      "DELE 3",
    ],
  },
];

var urlListener = {
  OnStartRunningUrl(url) {},
  OnStopRunningUrl(url, result) {
    try {
      var transaction = server.playTransaction();

      do_check_transaction(transaction, thisTest.transaction);

      Assert.equal(localAccountUtils.inboxFolder.getTotalMessages(false), 2);
      Assert.equal(localAccountUtils.inboxFolder.getNumUnread(false), 1);

      Assert.equal(result, 0);
    } catch (e) {
      // If we have an error, clean up nicely before we throw it.
      server.stop();

      var thread = Services.tm.currentThread;
      while (thread.hasPendingEvents()) {
        thread.processNextEvent(true);
      }

      do_throw(e);
    }

    // Let OnStopRunningUrl return cleanly before doing anything else.
    do_timeout(0, checkBusy);
  },
};

function checkBusy() {
  if (tests.length == 0) {
    incomingServer.closeCachedConnections();

    // No more tests, let everything finish
    server.stop();

    var thread = Services.tm.currentThread;
    while (thread.hasPendingEvents()) {
      thread.processNextEvent(true);
    }

    do_test_finished();
    return;
  }

  // If the server hasn't quite finished, just delay a little longer.
  if (incomingServer.serverBusy) {
    do_timeout(20, checkBusy);
    return;
  }

  testNext();
}

function testNext() {
  thisTest = tests.shift();

  // Handle the server in a try/catch/finally loop so that we always will stop
  // the server if something fails.
  try {
    server.resetTest();

    // Set up the test
    test = thisTest.title;

    daemon.setMessages(thisTest.messages);

    // Now get the mail
    MailServices.pop3.GetNewMail(
      null,
      urlListener,
      localAccountUtils.inboxFolder,
      incomingServer
    );

    server.performTest();
  } catch (e) {
    server.stop();

    do_throw(e);
  } finally {
    var thread = Services.tm.currentThread;
    while (thread.hasPendingEvents()) {
      thread.processNextEvent(true);
    }
  }
}

function run_test() {
  // Disable new mail notifications
  Services.prefs.setBoolPref("mail.biff.play_sound", false);
  Services.prefs.setBoolPref("mail.biff.show_alert", false);
  Services.prefs.setBoolPref("mail.biff.show_tray_icon", false);
  Services.prefs.setBoolPref("mail.biff.animate_dock_icon", false);
  Services.prefs.setIntPref("mail.server.default.dup_action", 2);

  server = setupServerDaemon();
  daemon = server[0];
  server = server[1];
  server.start();

  // Set up the basic accounts and folders
  incomingServer = createPop3ServerAndLocalFolders(server.port);

  // Create a cc filter
  var filters = incomingServer.getFilterList(null);

  var filter = filters.createFilter("cc dup test");
  filter.filterType = Ci.nsMsgFilterType.Incoming;
  var searchTerm = filter.createTerm();
  searchTerm.attrib = Ci.nsMsgSearchAttrib.CC;
  searchTerm.op = Ci.nsMsgSearchOp.Contains;
  var oldValue = searchTerm.value;
  oldValue.attrib = Ci.nsMsgSearchAttrib.CC;
  oldValue.str = "dupemail";
  searchTerm.value = oldValue;
  filter.appendTerm(searchTerm);
  var filterAction = filter.createAction();
  filterAction.type = Ci.nsMsgFilterAction.MarkRead;
  filter.appendAction(filterAction);
  filter.enabled = true;

  filters.insertFilterAt(0, filter);

  incomingServer.setFilterList(filters);

  // Check that we haven't got any messages in the folder, if we have its a test
  // setup issue.
  Assert.equal(localAccountUtils.inboxFolder.getTotalMessages(false), 0);

  do_test_pending();

  testNext();
}
