const fs = require('fs');
const file = 'c:/Users/HP/OneDrive/Desktop/enterprise-hrms-crm-application - Copy(d1)/src/pages/Dashboard.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/\r\n/g, '\n');

// Update imports
const importsRegex = /import \{\n  ResponsiveContainer,\n  BarChart,\n  Bar,\n  XAxis,\n  YAxis,\n  Tooltip,\n  Cell,\n  PieChart,\n  Pie\n\} from 'recharts';/g;
const newImports = `import {\n  ResponsiveContainer,\n  BarChart,\n  Bar,\n  XAxis,\n  YAxis,\n  Tooltip,\n  Cell,\n  PieChart,\n  Pie,\n  AreaChart,\n  Area\n} from 'recharts';`;
content = content.replace(importsRegex, newImports);

const lucideRegex = /import \{\n  Building2, AlertCircle, FileText, CheckCircle2, Clock, Info,\n  Search, Bell, DollarSign, Sparkles, ChevronRight, Users, Archive\n\} from 'lucide-react';/g;
const newLucide = `import {\n  Building2, AlertCircle, FileText, CheckCircle2, Clock, Info,\n  Search, Bell, DollarSign, Sparkles, ChevronRight, Users, Archive,\n  Wallet, Calendar, UserPlus, FileUp, BarChart2, Activity\n} from 'lucide-react';`;
content = content.replace(lucideRegex, newLucide);

const newContent = `    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="space-y-6 pb-10 font-sans"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-[22px] font-bold text-gray-900 tracking-tight">Good Morning, {currentCompany?.contactPerson || 'Rajesh'} 👋</h2>
            <p className="text-[13px] text-gray-500 mt-0.5">Here's what's happening in your organization today.</p>
          </div>
          <div className="flex items-center gap-3">
             <div className="bg-white border border-gray-200 shadow-sm rounded-lg px-3 py-2 text-[12px] font-medium text-gray-700 flex items-center gap-2 cursor-pointer hover:bg-gray-50 transition-colors">
               <Calendar size={14} className="text-gray-400" />
               May 01 - May 31, 2025
               <ChevronRight size={14} className="text-gray-400 rotate-90 ml-2" />
             </div>
             <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-2.5 text-gray-600 relative cursor-pointer hover:bg-gray-50 transition-colors">
               <Bell size={16} />
               <span className="absolute top-2 right-2.5 w-1.5 h-1.5 bg-red-500 rounded-full border border-white"></span>
             </div>
          </div>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
           {/* Total Employees */}
           <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5 hover:shadow-md transition-shadow relative overflow-hidden">
             <div className="flex justify-between items-start">
               <div className="flex gap-3 items-center">
                 <div className="w-10 h-10 rounded-full bg-blue-50 text-[#2563EB] flex items-center justify-center">
                   <Users size={18} strokeWidth={2.5} />
                 </div>
                 <div>
                   <p className="text-[12px] font-semibold text-gray-500">Total Employees</p>
                   <h3 className="text-[28px] font-bold text-gray-900 leading-tight mt-1"><AnimatedCounter value={totalEmployees} /></h3>
                 </div>
               </div>
             </div>
             <div className="flex justify-between items-end mt-4">
               <span className="text-[11px] font-semibold text-[#10B981] flex items-center gap-1">↑ 12 <span className="text-gray-400 font-medium">vs last month</span></span>
               <svg className="w-20 h-6 text-[#2563EB]" viewBox="0 0 100 30" fill="none" stroke="currentColor" strokeWidth="2.5">
                 <path d="M0,25 Q15,20 25,25 T50,15 T75,20 T100,5" strokeLinecap="round" strokeLinejoin="round"/>
               </svg>
             </div>
           </div>

           {/* Present Today */}
           <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5 hover:shadow-md transition-shadow relative overflow-hidden">
             <div className="flex justify-between items-start">
               <div className="flex gap-3 items-center">
                 <div className="w-10 h-10 rounded-full bg-emerald-50 text-[#10B981] flex items-center justify-center">
                   <CheckCircle2 size={18} strokeWidth={2.5} />
                 </div>
                 <div>
                   <p className="text-[12px] font-semibold text-gray-500">Present Today</p>
                   <h3 className="text-[28px] font-bold text-gray-900 leading-tight mt-1"><AnimatedCounter value={presentToday} /></h3>
                 </div>
               </div>
             </div>
             <div className="flex justify-between items-end mt-4">
               <span className="text-[11px] font-medium text-gray-500">{totalEmployees > 0 ? Math.round((presentToday/totalEmployees)*100) : 0}% of total</span>
               <svg className="w-20 h-6 text-[#10B981]" viewBox="0 0 100 30" fill="none" stroke="currentColor" strokeWidth="2.5">
                 <path d="M0,20 Q15,25 25,15 T50,15 T75,20 T100,5" strokeLinecap="round" strokeLinejoin="round"/>
               </svg>
             </div>
           </div>

           {/* Pending Leaves */}
           <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5 hover:shadow-md transition-shadow relative overflow-hidden">
             <div className="flex justify-between items-start">
               <div className="flex gap-3 items-center">
                 <div className="w-10 h-10 rounded-full bg-amber-50 text-[#F59E0B] flex items-center justify-center">
                   <UserPlus size={18} strokeWidth={2.5} />
                 </div>
                 <div>
                   <p className="text-[12px] font-semibold text-gray-500">Pending Leaves</p>
                   <h3 className="text-[28px] font-bold text-gray-900 leading-tight mt-1"><AnimatedCounter value={leaves.filter(l => l.status === 'Pending').length} /></h3>
                 </div>
               </div>
             </div>
             <div className="flex justify-between items-end mt-4">
               <span className="text-[11px] font-medium text-gray-500">{leaves.filter(l => l.status === 'Pending').length} Awaiting Approval</span>
               <svg className="w-20 h-6 text-[#F59E0B]" viewBox="0 0 100 30" fill="none" stroke="currentColor" strokeWidth="2.5">
                 <path d="M0,15 Q15,10 25,20 T50,25 T75,10 T100,5" strokeLinecap="round" strokeLinejoin="round"/>
               </svg>
             </div>
           </div>

           {/* Payroll This Month */}
           <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5 hover:shadow-md transition-shadow relative overflow-hidden">
             <div className="flex justify-between items-start">
               <div className="flex gap-3 items-center">
                 <div className="w-10 h-10 rounded-full bg-purple-50 text-[#8B5CF6] flex items-center justify-center">
                   <Wallet size={18} strokeWidth={2.5} />
                 </div>
                 <div>
                   <p className="text-[12px] font-semibold text-gray-500">Payroll This Month</p>
                   <h3 className="text-[24px] font-bold text-gray-900 leading-tight mt-1 truncate max-w-[150px]">₹ {(scopedPayroll.reduce((acc, p) => acc + (p.netSalary || 0), 0) / 100000).toFixed(1)}L</h3>
                 </div>
               </div>
             </div>
             <div className="flex justify-between items-end mt-4">
               <span onClick={() => onNavigate('payroll')} className="text-[11px] font-semibold text-[#2563EB] cursor-pointer hover:underline">View Summary</span>
               <svg className="w-20 h-6 text-[#8B5CF6]" viewBox="0 0 100 30" fill="none" stroke="currentColor" strokeWidth="2.5">
                 <path d="M0,25 Q15,25 25,20 T50,15 T75,10 T100,5" strokeLinecap="round" strokeLinejoin="round"/>
               </svg>
             </div>
           </div>
        </div>

        {/* Main Analytics Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
           {/* Left Column (Charts) */}
           <div className="lg:col-span-2 space-y-5">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
               {/* Employee Growth Chart */}
               <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5 h-[320px] flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-[14px] font-bold text-gray-800">Employee Growth <span className="text-gray-500 font-medium">(Last 6 Months)</span></h3>
                    <select className="text-[11px] border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-600 outline-none hover:border-gray-300">
                      <option>This Year</option>
                    </select>
                  </div>
                  <div className="flex-1 w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={[
                        { name: 'Dec', count: 100 },
                        { name: 'Jan', count: 110 },
                        { name: 'Feb', count: 115 },
                        { name: 'Mar', count: 120 },
                        { name: 'Apr', count: 125 },
                        { name: 'May', count: Math.max(128, totalEmployees) }
                      ]} margin={{ top: 15, right: 10, left: -25, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} domain={['dataMin - 10', 'auto']} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Area type="monotone" dataKey="count" stroke="#2563EB" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" activeDot={{ r: 6, fill: '#2563EB', stroke: '#fff', strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
               </div>

               {/* Department Distribution */}
               <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5 h-[320px] flex flex-col">
                  <h3 className="text-[14px] font-bold text-gray-800 mb-2">Department Distribution</h3>
                  <div className="flex-1 flex flex-col items-center justify-center relative mt-2">
                    <div className="w-full h-[180px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'Clinical', value: 45, color: '#2563EB' },
                              { name: 'Nursing', value: 32, color: '#8B5CF6' },
                              { name: 'IT', value: 20, color: '#10B981' },
                              { name: 'HR', value: 16, color: '#F59E0B' },
                              { name: 'Accounts', value: 15, color: '#06B6D4' }
                            ]}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={3}
                            dataKey="value"
                            stroke="none"
                          >
                            {[
                              { name: 'Clinical', value: 45, color: '#2563EB' },
                              { name: 'Nursing', value: 32, color: '#8B5CF6' },
                              { name: 'IT', value: 20, color: '#10B981' },
                              { name: 'HR', value: 16, color: '#F59E0B' },
                              { name: 'Accounts', value: 15, color: '#06B6D4' }
                            ].map((entry, index) => (
                              <Cell key={\`cell-\${index}\`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4 px-2">
                      {[
                        { name: 'Clinical', value: 45, color: 'bg-[#2563EB]' },
                        { name: 'Nursing', value: 32, color: 'bg-[#8B5CF6]' },
                        { name: 'IT', value: 20, color: 'bg-[#10B981]' },
                        { name: 'HR', value: 16, color: 'bg-[#F59E0B]' },
                        { name: 'Accounts', value: 15, color: 'bg-[#06B6D4]' }
                      ].map(d => (
                         <div key={d.name} className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
                           <span className={\`w-2 h-2 rounded-full \${d.color}\`}></span>
                           <span>{d.name}</span>
                         </div>
                      ))}
                    </div>
                  </div>
               </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
               {/* Top Departments (Horizontal Bars) */}
               <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5">
                  <div className="flex justify-between items-center mb-5">
                    <h3 className="text-[14px] font-bold text-gray-800">Top Departments</h3>
                    <span className="text-[11px] font-bold text-[#2563EB] cursor-pointer hover:underline">View Full Report</span>
                  </div>
                  <div className="space-y-4">
                    {[
                      { name: 'Clinical', value: 45, color: 'bg-[#2563EB]' },
                      { name: 'Nursing', value: 32, color: 'bg-[#8B5CF6]' },
                      { name: 'IT', value: 20, color: 'bg-[#10B981]' },
                      { name: 'HR', value: 16, color: 'bg-[#F59E0B]' },
                      { name: 'Accounts', value: 15, color: 'bg-[#06B6D4]' }
                    ].map((dept, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-[11px] font-bold mb-1.5 text-gray-700">
                          <span>{dept.name}</span>
                          <span>{dept.value} <span className="text-gray-400 font-medium">({dept.value}%)</span></span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div className={\`h-full rounded-full \${dept.color}\`} style={{ width: \`\${dept.value}%\` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
               </div>

               {/* Attendance Trend */}
               <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-[14px] font-bold text-gray-800">Attendance Trend <span className="text-gray-500 font-medium">(Last 30 Days)</span></h3>
                    <div className="flex gap-3 text-[10px] font-semibold">
                      <span className="flex items-center gap-1 text-gray-600"><span className="w-3 h-0.5 bg-[#2563EB]"></span> This Month</span>
                      <span className="flex items-center gap-1 text-gray-400"><span className="w-3 h-0.5 border-t-2 border-dashed border-gray-300"></span> Last Month</span>
                    </div>
                  </div>
                  <div className="w-full h-[180px] mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={[
                        { name: '01 May', current: 40, last: 60 },
                        { name: '08 May', current: 45, last: 70 },
                        { name: '15 May', current: 65, last: 55 },
                        { name: '22 May', current: 50, last: 80 },
                        { name: '31 May', current: 75, last: 65 }
                      ]} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorAtt" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={(val) => \`\${val}%\`} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Area type="monotone" dataKey="current" stroke="#2563EB" strokeWidth={2.5} fillOpacity={1} fill="url(#colorAtt)" activeDot={{ r: 5, fill: '#2563EB', stroke: '#fff', strokeWidth: 2 }} />
                        <Area type="monotone" dataKey="last" stroke="#CBD5E1" strokeWidth={2} strokeDasharray="4 4" fill="none" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
               </div>
             </div>
           </div>

           {/* Right Column */}
           <div className="space-y-5">
              {/* Pending Approvals */}
              <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-[14px] font-bold text-gray-800">Pending Approvals</h3>
                  <span className="text-[11px] font-bold text-[#2563EB] cursor-pointer hover:underline">View All</span>
                </div>
                <div className="space-y-4">
                   <div className="flex items-center justify-between">
                     <div className="flex items-center gap-3">
                       <div className="p-2 bg-orange-50 text-orange-500 rounded-lg"><Calendar size={16} strokeWidth={2.5}/></div>
                       <span className="text-[12px] font-semibold text-gray-700">Leave Requests</span>
                     </div>
                     <span className="text-[13px] font-bold text-gray-900">{leaves.filter(l => l.status === 'Pending').length.toString().padStart(2, '0')}</span>
                   </div>
                   <div className="flex items-center justify-between">
                     <div className="flex items-center gap-3">
                       <div className="p-2 bg-blue-50 text-[#2563EB] rounded-lg"><FileText size={16} strokeWidth={2.5}/></div>
                       <span className="text-[12px] font-semibold text-gray-700">Document Requests</span>
                     </div>
                     <span className="text-[13px] font-bold text-gray-900">04</span>
                   </div>
                   <div className="flex items-center justify-between">
                     <div className="flex items-center gap-3">
                       <div className="p-2 bg-pink-50 text-pink-500 rounded-lg"><Archive size={16} strokeWidth={2.5}/></div>
                       <span className="text-[12px] font-semibold text-gray-700">Exit Clearances</span>
                     </div>
                     <span className="text-[13px] font-bold text-gray-900">02</span>
                   </div>
                </div>
              </div>

              {/* Recent Activities */}
              <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-[14px] font-bold text-gray-800">Recent Activities</h3>
                  <span className="text-[11px] font-bold text-[#2563EB] cursor-pointer hover:underline">View All</span>
                </div>
                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-[13px] before:-translate-x-px before:h-full before:w-[2px] before:bg-slate-100">
                   <div className="relative flex items-start gap-4">
                     <div className="w-7 h-7 rounded-full bg-blue-50 border-[3px] border-white flex items-center justify-center z-10 text-[#2563EB] shadow-sm"><Users size={12} strokeWidth={3}/></div>
                     <div className="flex-1 pb-1">
                       <p className="text-[12px] font-semibold text-gray-800">A new employee Priyanka Patel</p>
                       <p className="text-[10px] text-gray-500 mt-0.5">joined today <span className="float-right text-gray-400">2h ago</span></p>
                     </div>
                   </div>
                   <div className="relative flex items-start gap-4">
                     <div className="w-7 h-7 rounded-full bg-purple-50 border-[3px] border-white flex items-center justify-center z-10 text-[#8B5CF6] shadow-sm"><Wallet size={12} strokeWidth={3}/></div>
                     <div className="flex-1 pb-1">
                       <p className="text-[12px] font-semibold text-gray-800">Salary cycle May Month</p>
                       <p className="text-[10px] text-gray-500 mt-0.5">has been generated <span className="float-right text-gray-400">3h ago</span></p>
                     </div>
                   </div>
                   <div className="relative flex items-start gap-4">
                     <div className="w-7 h-7 rounded-full bg-emerald-50 border-[3px] border-white flex items-center justify-center z-10 text-[#10B981] shadow-sm"><CheckCircle2 size={12} strokeWidth={3}/></div>
                     <div className="flex-1 pb-1">
                       <p className="text-[12px] font-semibold text-gray-800">Salary processed for April 2025</p>
                       <p className="text-[10px] text-gray-500 mt-0.5"><span className="float-right text-gray-400">5h ago</span></p>
                     </div>
                   </div>
                </div>
              </div>

              {/* Notifications */}
              <div className="bg-white rounded-[18px] border border-[#E2E8F0] shadow-sm p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-[14px] font-bold text-gray-800">Notifications</h3>
                  <span className="text-[11px] font-bold text-[#2563EB] cursor-pointer hover:underline">View All</span>
                </div>
                <div className="space-y-3.5">
                   <div className="flex items-center gap-3">
                     <div className="text-gray-400 bg-gray-50 p-1.5 rounded-md"><Info size={14} strokeWidth={2.5}/></div>
                     <p className="text-[12px] text-gray-700 font-medium truncate">Team meeting tomorrow at 11 AM</p>
                   </div>
                   <div className="flex items-center gap-3">
                     <div className="text-gray-400 bg-gray-50 p-1.5 rounded-md"><Info size={14} strokeWidth={2.5}/></div>
                     <p className="text-[12px] text-gray-700 font-medium truncate">Policy update: New leave policy</p>
                   </div>
                   <div className="flex items-center gap-3">
                     <div className="text-gray-400 bg-gray-50 p-1.5 rounded-md"><Info size={14} strokeWidth={2.5}/></div>
                     <p className="text-[12px] text-gray-700 font-medium truncate">Work anniversary wishes pending</p>
                   </div>
                </div>
              </div>
           </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-4">
          <h3 className="text-[15px] font-bold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
             <button onClick={() => onNavigate('employees')} className="bg-white border border-[#E2E8F0] shadow-sm hover:shadow-md hover:border-[#2563EB]/30 rounded-[16px] p-3.5 flex items-center justify-center sm:justify-start gap-3 transition-all group">
               <div className="p-2 bg-blue-50 text-[#2563EB] rounded-xl group-hover:scale-110 transition-transform"><UserPlus size={18} strokeWidth={2.5}/></div>
               <span className="text-[12px] font-bold text-gray-700 hidden sm:block">Add Employee</span>
             </button>
             <button onClick={() => onNavigate('attendance')} className="bg-white border border-[#E2E8F0] shadow-sm hover:shadow-md hover:border-[#10B981]/30 rounded-[16px] p-3.5 flex items-center justify-center sm:justify-start gap-3 transition-all group">
               <div className="p-2 bg-emerald-50 text-[#10B981] rounded-xl group-hover:scale-110 transition-transform"><CheckCircle2 size={18} strokeWidth={2.5}/></div>
               <span className="text-[12px] font-bold text-gray-700 hidden sm:block">Mark Attendance</span>
             </button>
             <button onClick={() => onNavigate('leaves')} className="bg-white border border-[#E2E8F0] shadow-sm hover:shadow-md hover:border-[#F59E0B]/30 rounded-[16px] p-3.5 flex items-center justify-center sm:justify-start gap-3 transition-all group">
               <div className="p-2 bg-amber-50 text-[#F59E0B] rounded-xl group-hover:scale-110 transition-transform"><Clock size={18} strokeWidth={2.5}/></div>
               <span className="text-[12px] font-bold text-gray-700 hidden sm:block">Approve Leave</span>
             </button>
             <button onClick={() => onNavigate('payroll')} className="bg-white border border-[#E2E8F0] shadow-sm hover:shadow-md hover:border-[#8B5CF6]/30 rounded-[16px] p-3.5 flex items-center justify-center sm:justify-start gap-3 transition-all group">
               <div className="p-2 bg-purple-50 text-[#8B5CF6] rounded-xl group-hover:scale-110 transition-transform"><Wallet size={18} strokeWidth={2.5}/></div>
               <span className="text-[12px] font-bold text-gray-700 hidden sm:block">Run Payroll</span>
             </button>
             <button onClick={() => onNavigate('documents')} className="bg-white border border-[#E2E8F0] shadow-sm hover:shadow-md hover:border-[#0D9488]/30 rounded-[16px] p-3.5 flex items-center justify-center sm:justify-start gap-3 transition-all group">
               <div className="p-2 bg-teal-50 text-[#0D9488] rounded-xl group-hover:scale-110 transition-transform"><FileUp size={18} strokeWidth={2.5}/></div>
               <span className="text-[12px] font-bold text-gray-700 hidden sm:block">Upload Document</span>
             </button>
             <button onClick={() => onNavigate('reports')} className="bg-white border border-[#E2E8F0] shadow-sm hover:shadow-md hover:border-[#4F46E5]/30 rounded-[16px] p-3.5 flex items-center justify-center sm:justify-start gap-3 transition-all group">
               <div className="p-2 bg-indigo-50 text-[#4F46E5] rounded-xl group-hover:scale-110 transition-transform"><BarChart2 size={18} strokeWidth={2.5}/></div>
               <span className="text-[12px] font-bold text-gray-700 hidden sm:block">View Reports</span>
             </button>
          </div>
        </div>
      </motion.div>
    );
};`;

const startIndex = content.lastIndexOf('    return (\n      <motion.div\n        initial={{ opacity: 0, y: 15 }}\n        animate={{ opacity: 1, y: 0 }}\n        transition={{ duration: 0.45 }}\n        className="space-y-4"');

if (startIndex !== -1) {
    content = content.substring(0, startIndex) + newContent;
    if (!content.includes('import AnimatedCounter')) {
        content = content.replace('export const Dashboard: React.FC<DashboardProps> = ({', 'import AnimatedCounter from \'../components/common/AnimatedCounter\';\n\nexport const Dashboard: React.FC<DashboardProps> = ({');
    }
    fs.writeFileSync(file, content);
    console.log('Successfully replaced content!');
} else {
    console.log('Could not find start index!');
}
