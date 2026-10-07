function doPost(e) {
  try {
    if (!e.parameter || !e.parameter.payload) {
      return HtmlService.createHtmlOutput("<h2>Error: No payload provided.</h2>");
    }

    const payload = JSON.parse(e.parameter.payload);
    const appliedCompanies = payload.companies.map(c => c.toLowerCase().trim());
    const sheetUrl = payload.sheetUrl;
    
    if (!appliedCompanies || appliedCompanies.length === 0) {
       return HtmlService.createHtmlOutput("<h2>No applied companies found in your portal.</h2>");
    }
    
    if (!sheetUrl) {
       return HtmlService.createHtmlOutput("<h2>Error: Schedule Sheet URL is missing.</h2>");
    }

    // Extract Spreadsheet ID from the URL
    const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match || !match[1]) {
       return HtmlService.createHtmlOutput("<h2>Error: Invalid Google Sheet URL.</h2>");
    }
    const spreadsheetId = match[1];
    
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getActiveSheet();
    const rows = sheet.getDataRange().getValues();
    
    let createdEventLogs = [];
    let existingEventLogs = [];
    const calendar = CalendarApp.getDefaultCalendar();
    
    for (let i = 2; i < rows.length; i++) { // Skip headers
      const row = rows[i];
      const dateStr = row[0]; // e.g., "19 September"
      if (!dateStr) continue;
      
      const year = new Date().getFullYear(); // Assume current year
      
      // Parse PPT
      const pptCompany = row[3] ? row[3].toString().toLowerCase().trim() : '';
      if (pptCompany && appliedCompanies.some(c => c.includes(pptCompany) || pptCompany.includes(c))) {
         const startTime = row[1];
         const endTime = row[2];
         if (startTime && endTime) {
            const eventInfo = createOrCheckEvent(calendar, dateStr, year, startTime, endTime, `PPT: ${row[3]}`, row[5]);
            if (eventInfo) {
               if (eventInfo.created) createdEventLogs.push(eventInfo);
               else existingEventLogs.push(eventInfo);
            }
         }
      }
      
      // Parse Exam
      const examCompany = row[9] ? row[9].toString().toLowerCase().trim() : '';
      if (examCompany && appliedCompanies.some(c => c.includes(examCompany) || examCompany.includes(c))) {
         const startTime = row[7];
         const endTime = row[8];
         if (startTime && endTime) {
            const eventInfo = createOrCheckEvent(calendar, dateStr, year, startTime, endTime, `OA: ${row[9]}`, row[11]);
            if (eventInfo) {
               if (eventInfo.created) createdEventLogs.push(eventInfo);
               else existingEventLogs.push(eventInfo);
            }
         }
      }
    }
    
    let createdHtml = createdEventLogs.map(log => `<li style="margin-bottom: 8px;"><strong>${log.title}</strong><br><span style="color:#555;">${log.startStr} to ${log.endStr}</span></li>`).join('');
    let existingHtml = existingEventLogs.map(log => `<li style="margin-bottom: 8px; color: #666;">[Already Existed] <strong>${log.title}</strong><br><span>${log.startStr} to ${log.endStr}</span></li>`).join('');
    
    if (createdEventLogs.length === 0) createdHtml = "<li>No new events created.</li>";
    if (existingEventLogs.length === 0) existingHtml = "<li>No existing events found.</li>";

    return HtmlService.createHtmlOutput(`
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h1 style="color: #28a745; text-align: center;">Sync Complete!</h1>
        <p style="font-size: 16px; text-align: center;">Created: <strong>${createdEventLogs.length}</strong> | Already Existed: <strong>${existingEventLogs.length}</strong></p>
        
        <h3 style="margin-top: 30px;">Newly Created Events:</h3>
        <ul style="text-align: left; background: #f9f9f9; padding: 15px 30px; border-radius: 6px;">
          ${createdHtml}
        </ul>

        <h3 style="margin-top: 30px; color: #666;">Events That Already Existed:</h3>
        <ul style="text-align: left; background: #eee; padding: 15px 30px; border-radius: 6px; font-size: 14px;">
          ${existingHtml}
        </ul>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px; text-align: center;">Look at the exact dates above to find them on your calendar!</p>
      </div>
    `);

  } catch(error) {
    return HtmlService.createHtmlOutput(`
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align: center; margin-top: 100px;">
        <h1 style="color: #dc3545;">An Error Occurred</h1>
        <p style="font-size: 16px; color: #333;">${error.toString()}</p>
      </div>
    `);
  }
}

// Enable CORS for preflight requests
function doOptions(e) {
  return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.JSON);
}

// Returns event info object, null if failed to parse
function createOrCheckEvent(calendar, dateStr, year, startTime, endTime, title, location) {
    let start, end;
    let baseDate;
    
    if (dateStr instanceof Date) {
      baseDate = new Date(dateStr.getTime());
      baseDate.setFullYear(year);
    } else {
      baseDate = new Date(`${dateStr} ${year}`);
    }
    
    if (startTime instanceof Date) {
       start = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), startTime.getHours(), startTime.getMinutes());
    } else {
       start = parseTimeStr(baseDate, startTime);
    }
    
    if (endTime instanceof Date) {
       end = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), endTime.getHours(), endTime.getMinutes());
    } else {
       end = parseTimeStr(baseDate, endTime);
    }
    
    if (isNaN(start) || isNaN(end)) return null;
    
    const existingEvents = calendar.getEvents(start, end, {search: title});
    
    if (existingEvents.length > 0) {
       return {
         created: false,
         title: title,
         startStr: start.toLocaleString(),
         endStr: end.toLocaleString()
       };
    }
    
    const event = calendar.createEvent(title, start, end, {location: location || ''});
    
    event.removeAllReminders();
    event.addPopupReminder(1440);
    event.addPopupReminder(60);
    
    return {
       created: true,
       title: title,
       startStr: start.toLocaleString(),
       endStr: end.toLocaleString()
    };
}

function parseTimeStr(baseDate, timeStr) {
    const match = String(timeStr).match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!match) return new Date("invalid");
    
    let hours = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    const ampm = match[3] ? match[3].toUpperCase() : null;
    
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    
    return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hours, mins);
}
