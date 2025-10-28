export function getReminderEmailHtml(userName, expiringClaims) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
          .claim-card { background: white; border: 2px solid #fbbf24; border-radius: 8px; padding: 15px; margin: 15px 0; }
          .urgent { border-color: #ef4444; }
          .pet-name { font-size: 18px; font-weight: bold; color: #1f2937; }
          .deadline { color: #dc2626; font-weight: bold; font-size: 16px; }
          .amount { color: #059669; font-weight: bold; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
          .button { display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🐾 Pet Claim Reminder</h1>
          </div>
          <div class="content">
            <p>Hi ${userName},</p>
            <p>You have <strong>${expiringClaims.length}</strong> pet insurance claim${expiringClaims.length > 1 ? 's' : ''} expiring soon!</p>
            
            ${expiringClaims.map(claim => {
              const daysLeft = Math.ceil((new Date(claim.deadline) - new Date()) / (1000 * 60 * 60 * 24));
              const isUrgent = daysLeft <= 7;
              
              return `
                <div class="claim-card ${isUrgent ? 'urgent' : ''}">
                  <div class="pet-name">🐕 ${claim.petName}</div>
                  <p><strong>Service Date:</strong> ${new Date(claim.serviceDate).toLocaleDateString()}</p>
                  <p><strong>Amount:</strong> <span class="amount">$${claim.amount.toFixed(2)}</span></p>
                  <p class="deadline">⚠️ Deadline: ${new Date(claim.deadline).toLocaleDateString()} (${daysLeft} days left)</p>
                  <p><strong>Status:</strong> ${claim.filingStatus}</p>
                </div>
              `;
            }).join('')}
            
            <p style="margin-top: 20px;">Don't forget to file these claims before the deadline!</p>
            
            <center>
              <a href="http://localhost:5173" class="button">View All Claims</a>
            </center>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Pet Claim Helper</p>
            <p>You're receiving this because you have expiring pet insurance claims.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }