try { 
  const officerForm = {role: 'Admin', password: 'password'}; 
  const savedUser = {username: 'foo'}; 
  console.log(`Successfully provisioned new ${officerForm.role} credential:\nID: ${savedUser.username}\nPassword: ${savedUser.passwordStr}`); 
} catch(e) { 
  console.error('ERROR', e);
}
