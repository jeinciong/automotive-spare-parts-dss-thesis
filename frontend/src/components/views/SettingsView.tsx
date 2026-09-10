import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Separator } from "../ui/separator";
import { Badge } from "../ui/badge";
import { 
  User, Bell, Shield, Palette, Save,
  AlertCircle, Users, UserPlus, Building2,
  Trash2,
  Pencil,
  Database,
  Lock,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../ui/table";
import { apiUrl } from "../../lib/api";

interface TeamMember {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: "Business Owner" | "Team Member";
  createdAt: string;
}

export function SettingsView() {
  // User & Team States
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
  
  // Notification States
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [lowStockAlerts, setLowStockAlerts] = useState(true);

  // Data Settings States
  const [autoRunForecast, setAutoRunForecast] = useState(() => {
    return localStorage.getItem("autoRunForecast") === "true";
  });
  const [isAutoRunConfirmOpen, setIsAutoRunConfirmOpen] = useState(false);
  const [autoRunAccountName, setAutoRunAccountName] = useState("");
  const [autoRunPassword, setAutoRunPassword] = useState("");
  const [autoRunConfirmError, setAutoRunConfirmError] = useState("");
  const [isVerifyingAutoRun, setIsVerifyingAutoRun] = useState(false);
  
  // New Member Form State
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberFullName, setNewMemberFullName] = useState("");
  const [newMemberPassword, setNewMemberPassword] = useState("");
  const [newMemberConfirmPassword, setNewMemberConfirmPassword] = useState("");

  const [businessInfo, setBusinessInfo] = useState({
    name: savedUser.user_name || "",
    email: savedUser.email || "",
    address: savedUser.business_address ||"" 
  });

  const resetAutoRunConfirmation = () => {
    setAutoRunAccountName("");
    setAutoRunPassword("");
    setAutoRunConfirmError("");
  };

  const handleAutoRunDialogChange = (open: boolean) => {
    if (isVerifyingAutoRun && !open) return;
    setIsAutoRunConfirmOpen(open);
    if (!open) resetAutoRunConfirmation();
  };

  const handleAutoRunForecastChange = (checked: boolean) => {
    if (!checked) {
      setAutoRunForecast(false);
      localStorage.setItem("autoRunForecast", "false");
      toast.success("Auto-run forecasts disabled");
      return;
    }

    resetAutoRunConfirmation();
    setIsAutoRunConfirmOpen(true);
  };

  const handleConfirmAutoRun = async () => {
    const expectedAccountName = businessInfo.name.trim();
    const enteredAccountName = autoRunAccountName.trim();

    if (!expectedAccountName || enteredAccountName !== expectedAccountName) {
      setAutoRunConfirmError("Business name does not match the current account.");
      return;
    }
    if (!autoRunPassword) {
      setAutoRunConfirmError("Password is required.");
      return;
    }
    if (!savedUser.business_id && !savedUser.user_id) {
      setAutoRunConfirmError("Your session details are missing. Please sign in again.");
      return;
    }

    setIsVerifyingAutoRun(true);
    setAutoRunConfirmError("");

    try {
      const response = await fetch(apiUrl("/api/verify-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_id: savedUser.business_id,
          user_id: savedUser.user_id,
          role: savedUser.role,
          account_name: enteredAccountName,
          password: autoRunPassword,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setAutoRunConfirmError("Could not verify your account. Please try again.");
        return;
      }
      if (!data.valid) {
        setAutoRunConfirmError("Incorrect account name or password.");
        return;
      }

      setAutoRunForecast(true);
      localStorage.setItem("autoRunForecast", "true");
      setIsAutoRunConfirmOpen(false);
      resetAutoRunConfirmation();
      toast.success("Auto-run forecasts enabled");
    } catch {
      setAutoRunConfirmError("Could not verify your account. Please check your connection and try again.");
    } finally {
      setIsVerifyingAutoRun(false);
    }
  };

  const [isEditMemberOpen, setIsEditMemberOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [passwords, setPasswords] = useState({ old: "", new: "", confirm: "" });

  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
  const [deleteAccountName, setDeleteAccountName] = useState("");
  const [deleteAccountPassword, setDeleteAccountPassword] = useState("");
  const [deleteAccountError, setDeleteAccountError] = useState("");

  const [isDeleteStaffOpen, setIsDeleteStaffOpen] = useState(false);
  const [deletingStaffMember, setDeletingStaffMember] = useState<TeamMember | null>(null);
  const [deleteStaffConfirmBusinessName, setDeleteStaffConfirmBusinessName] = useState("");
  const [deleteStaffPassword, setDeleteStaffPassword] = useState("");
  const [deleteStaffError, setDeleteStaffError] = useState("");

  // Live validation states
  const [emailCheckResult, setEmailCheckResult] = useState<{ loading: boolean; exists: boolean | null }>({ loading: false, exists: null });
  const [nameCheckResult, setNameCheckResult] = useState<{ loading: boolean; exists: boolean | null }>({ loading: false, exists: null });
  const [editEmailCheckResult, setEditEmailCheckResult] = useState<{ loading: boolean; exists: boolean | null }>({ loading: false, exists: null });
  const [editNameCheckResult, setEditNameCheckResult] = useState<{ loading: boolean; exists: boolean | null }>({ loading: false, exists: null });

  // Dialog-level submit errors
  const [addStaffError, setAddStaffError] = useState("");
  const [editStaffError, setEditStaffError] = useState("");

  const handleUpdateBusiness = async () => {
  const response = await fetch(apiUrl(`/api/business/${savedUser.business_id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_name: businessInfo.name,
      email: businessInfo.email,
      business_address: businessInfo.address
    })
  });

  if (response.ok) {
    // Update localStorage so it persists on refresh
    const updatedUser = { 
      ...savedUser, 
      user_name: businessInfo.name, 
      email: businessInfo.email,
      // Add the address here if your local storage user object tracks it
      business_address: businessInfo.address 
    };
    localStorage.setItem("user", JSON.stringify(updatedUser));

    setBusinessInfo({
      name: businessInfo.name,
      email: businessInfo.email,
      address: businessInfo.address
    });

    toast.success("Business profile updated!");
  } else {
    toast.error("Failed to update business profile");
  }
};

  const handleChangePassword = async () => {
      if (passwords.new !== passwords.confirm) return toast.error("Passwords do not match");
      
      const response = await fetch(apiUrl(`/api/change-password/${savedUser.business_id || savedUser.user_id}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              oldPassword: passwords.old,
              newPassword: passwords.new,
              isStaff: !!savedUser.user_id
          })
      });
      
      if (response.ok) {
          toast.success("Password changed!");
          setPasswords({ old: "", new: "", confirm: "" });
      } else {
          toast.error("Invalid old password");
      }
  };

  const handleDeleteAccount = async () => {
      if (deleteAccountName !== businessInfo.name) {
          setDeleteAccountError("Business name does not match.");
          return;
      }
      if (!deleteAccountPassword) {
          setDeleteAccountError("Password is required.");
          return;
      }
      setDeleteAccountError("");

      try {
          const response = await fetch(apiUrl(`/api/business/${savedUser.business_id}`), { 
              method: 'DELETE',
              headers: { 
                  'Content-Type': 'application/json',
                  'x-password': encodeURIComponent(deleteAccountPassword)
              },
              body: JSON.stringify({ password: deleteAccountPassword })
          });
          if (response.ok) {
              localStorage.clear();
              window.location.href = "/login";
          } else {
              const data = await response.json();
              setDeleteAccountError(data.error || "Failed to delete account");
          }
      } catch (err) {
          setDeleteAccountError("Network error. Try again.");
      }
  };

  // Data Export Function
  const exportData = async () => {
    try {
        const response = await fetch(apiUrl(`/api/export-all?business_id=${savedUser.business_id}`));
        
        if (!response.ok) throw new Error("Server export failed");

        const fullData = await response.json();
        
        // Convert to string with 2-space indentation for readability
        const jsonString = JSON.stringify(fullData, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        
        // Trigger download
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Business_Backup_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        toast.success("Full business database exported!");
    } catch (error) {
        console.error("Export Error:", error);
        toast.error("Failed to export database");
    }
  };

  // Appearance
  const toggleTheme = (mode: string) => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    if (mode === "dark") root.classList.add("dark");
    localStorage.setItem("theme", mode);
    toast.info(`Theme set to ${mode} mode`);
  };

  const handleDeleteStaffClick = (m: TeamMember) => {
    setDeletingStaffMember(m);
    setDeleteStaffConfirmBusinessName("");
    setDeleteStaffPassword("");
    setDeleteStaffError("");
    setIsDeleteStaffOpen(true);
  };

  const handleConfirmDeleteStaff = async () => {
    if (!deletingStaffMember) return;
    if (deleteStaffConfirmBusinessName !== businessInfo.name) {
      setDeleteStaffError("Business name does not match.");
      return;
    }
    if (!deleteStaffPassword) {
      setDeleteStaffError("Business account password is required.");
      return;
    }
    setDeleteStaffError("");

    try {
      const response = await fetch(apiUrl(`/api/team/${deletingStaffMember.id}`), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-password': encodeURIComponent(deleteStaffPassword)
        },
        body: JSON.stringify({ password: deleteStaffPassword })
      });

      if (response.ok) {
        setTeamMembers(prev => prev.filter(m => m.id !== deletingStaffMember.id));
        setIsDeleteStaffOpen(false);
        setDeletingStaffMember(null);
        toast.success("Staff member removed successfully!");
      } else {
        const errorData = await response.json();
        setDeleteStaffError(errorData.error || errorData.message || "Failed to delete staff member");
      }
    } catch (err) {
      setDeleteStaffError("Network error. Try again.");
    }
  };

  const handleEditClick = (m: TeamMember) => {
    setEditingMember({ ...m });
    setIsEditMemberOpen(true);
  };

  const handleUpdateStaff = async () => {
    setEditStaffError("");
    if (!editingMember || !editingMember.id) {
      setEditStaffError("No member selected");
      return;
    }

    if (editEmailCheckResult.exists) {
      setEditStaffError("This email is already registered in the system.");
      return;
    }
    if (editNameCheckResult.exists) {
      setEditStaffError("A staff member with this name already exists in the system.");
      return;
    }

    const emailExistsLocally = teamMembers.some(m => m.id !== editingMember.id && m.email.toLowerCase() === editingMember.email.trim().toLowerCase());
    const nameExistsLocally = teamMembers.some(m => m.id !== editingMember.id && m.fullName.toLowerCase() === editingMember.fullName.trim().toLowerCase());
    
    if (emailExistsLocally) {
      setEditStaffError("This email is already registered for another staff member.");
      return;
    }
    if (nameExistsLocally) {
      setEditStaffError("Another staff member with this name already exists.");
      return;
    }

    try {
      const response = await fetch(apiUrl(`/api/team/${editingMember.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: editingMember.fullName.trim(),
          email: editingMember.email.trim(),
          role: editingMember.role === "Business Owner" ? "Admin" : "Business" 
        }),
      });

      if (response.ok) {
        setTeamMembers(prev => prev.map(member => 
          member.id === editingMember.id ? editingMember : member
        ));
        setEditEmailCheckResult({ loading: false, exists: null });
        setEditNameCheckResult({ loading: false, exists: null });
        setEditStaffError("");
        setIsEditMemberOpen(false);
        toast.success("Staff updated successfully");
      } else {
        const errorData = await response.json();
        setEditStaffError(errorData.message || "Update failed on server");
      }
    } catch (error) {
      console.error("Update error:", error);
      setEditStaffError("Connection failed");
    }
  };

  const getRoleBadgeColor = (role: string) => {
    return role === "Business Owner" 
      ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white" 
      : "bg-gradient-to-r from-blue-500 to-indigo-500 text-white";
  };

  useEffect(() => {
    const fetchTeam = async () => {
      if (!savedUser.business_id) return;
      try {
        const response = await fetch(apiUrl(`/api/team?business_id=${savedUser.business_id}`));
        if (response.ok) {
          const data = await response.json();
          const mappedTeam = data.map((m: any) => ({
            id: m.user_id.toString(),
            username: m.email.split('@')[0],
            email: m.email,
            fullName: m.full_name,
            role: m.role === 'Admin' ? "Business Owner" : "Team Member",
            createdAt: m.created_at ? m.created_at.split('T')[0] : "N/A"
          }));
          setTeamMembers(mappedTeam);
        }
      } catch (error) {
        console.error("Error fetching team:", error);
      }
    };
    fetchTeam();
  }, [savedUser.business_id]);

  useEffect(() => {
    const fetchBusiness = async () => {
      if (!savedUser.business_id) return;
      try {
        const response = await fetch(apiUrl(`/api/business/${savedUser.business_id}`));
        if (response.ok) {
          const data = await response.json();
          setBusinessInfo({
            name: data.business_name || "",
            email: data.email || "",
            address: data.business_address || ""
          });
          // Sync with localStorage
          const updatedUser = {
            ...savedUser,
            user_name: data.business_name || "",
            email: data.email || "",
            business_address: data.business_address || ""
          };
          localStorage.setItem("user", JSON.stringify(updatedUser));
        }
      } catch (error) {
        console.error("Error fetching business info:", error);
      }
    };
    fetchBusiness();
  }, [savedUser.business_id]);

  // Debounce check for new member email
  useEffect(() => {
    if (!newMemberEmail.trim()) {
      setEmailCheckResult({ loading: false, exists: null });
      return;
    }

    setEmailCheckResult({ loading: true, exists: null });
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(apiUrl(`/api/team/availability?email=${encodeURIComponent(newMemberEmail.trim())}`));
        if (response.ok) {
          const data = await response.json();
          setEmailCheckResult({ loading: false, exists: data.emailExists });
        } else {
          setEmailCheckResult({ loading: false, exists: null });
        }
      } catch (err) {
        setEmailCheckResult({ loading: false, exists: null });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [newMemberEmail]);

  // Debounce check for new member name
  useEffect(() => {
    if (!newMemberFullName.trim()) {
      setNameCheckResult({ loading: false, exists: null });
      return;
    }

    setNameCheckResult({ loading: true, exists: null });
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(apiUrl(`/api/team/availability?fullName=${encodeURIComponent(newMemberFullName.trim())}`));
        if (response.ok) {
          const data = await response.json();
          setNameCheckResult({ loading: false, exists: data.nameExists });
        } else {
          setNameCheckResult({ loading: false, exists: null });
        }
      } catch (err) {
        setNameCheckResult({ loading: false, exists: null });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [newMemberFullName]);

  // Debounce check for editing member email
  useEffect(() => {
    if (!editingMember || !editingMember.email.trim()) {
      setEditEmailCheckResult({ loading: false, exists: null });
      return;
    }

    setEditEmailCheckResult({ loading: true, exists: null });
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(apiUrl(`/api/team/availability?email=${encodeURIComponent(editingMember.email.trim())}&excludeUserId=${editingMember.id}`));
        if (response.ok) {
          const data = await response.json();
          setEditEmailCheckResult({ loading: false, exists: data.emailExists });
        } else {
          setEditEmailCheckResult({ loading: false, exists: null });
        }
      } catch (err) {
        setEditEmailCheckResult({ loading: false, exists: null });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [editingMember?.email, editingMember?.id]);

  // Debounce check for editing member name
  useEffect(() => {
    if (!editingMember || !editingMember.fullName.trim()) {
      setEditNameCheckResult({ loading: false, exists: null });
      return;
    }

    setEditNameCheckResult({ loading: true, exists: null });
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(apiUrl(`/api/team/availability?fullName=${encodeURIComponent(editingMember.fullName.trim())}&excludeUserId=${editingMember.id}`));
        if (response.ok) {
          const data = await response.json();
          setEditNameCheckResult({ loading: false, exists: data.nameExists });
        } else {
          setEditNameCheckResult({ loading: false, exists: null });
        }
      } catch (err) {
        setEditNameCheckResult({ loading: false, exists: null });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [editingMember?.fullName, editingMember?.id]);


  const handleAddTeamMember = async () => {
    setAddStaffError("");
    if (!newMemberEmail || !newMemberFullName || !newMemberPassword || !newMemberConfirmPassword) {
      setAddStaffError("Please fill in all required fields");
      return;
    }

    if (newMemberPassword !== newMemberConfirmPassword) {
      setAddStaffError("Passwords do not match");
      return;
    }

    if (emailCheckResult.exists) {
      setAddStaffError("This email is already registered in the system.");
      return;
    }
    if (nameCheckResult.exists) {
      setAddStaffError("A staff member with this name already exists in the system.");
      return;
    }

    const emailExistsLocally = teamMembers.some(m => m.email.toLowerCase() === newMemberEmail.trim().toLowerCase());
    const nameExistsLocally = teamMembers.some(m => m.fullName.toLowerCase() === newMemberFullName.trim().toLowerCase());
    
    if (emailExistsLocally) {
      setAddStaffError("This email is already registered for a staff member.");
      return;
    }
    if (nameExistsLocally) {
      setAddStaffError("A staff member with this name already exists.");
      return;
    }

    try {
      const response = await fetch(apiUrl("/api/team"), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: newMemberFullName.trim(),
          email: newMemberEmail.trim(),
          password: newMemberPassword,
          business_id: savedUser.business_id
        }),
      });

      if (response.ok) {
        const createdStaff = await response.json();
        const memberForUI: TeamMember = {
          id: createdStaff.user_id.toString(),
          username: createdStaff.email.split('@')[0],
          email: createdStaff.email,
          fullName: createdStaff.full_name,
          role: "Team Member",
          createdAt: new Date().toISOString().split('T')[0]
        };
        setTeamMembers(prev => [...prev, memberForUI]);
        setNewMemberEmail(""); setNewMemberFullName(""); setNewMemberPassword(""); setNewMemberConfirmPassword("");
        setEmailCheckResult({ loading: false, exists: null });
        setNameCheckResult({ loading: false, exists: null });
        setAddStaffError("");
        setIsAddMemberOpen(false);
        toast.success("Staff account created successfully!");
      } else {
        const errorData = await response.json();
        setAddStaffError(errorData.message || "Failed to create staff account");
      }
    } catch (error) {
      setAddStaffError("Connection failed");
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your automotive business preferences and team.</p>
      </header>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-6 h-auto mb-8">
          <TabsTrigger value="general" className="text-[11px] sm:text-sm px-1 sm:px-3"><User className="w-4 h-4 mr-2 hidden sm:inline" />General</TabsTrigger>
          <TabsTrigger value="team" className="text-[11px] sm:text-sm px-1 sm:px-3"><Users className="w-4 h-4 mr-2 hidden sm:inline" />Team</TabsTrigger>
          <TabsTrigger value="data" className="text-[11px] sm:text-sm px-1 sm:px-3"><Database className="w-4 h-4 mr-2 hidden sm:inline" />Data</TabsTrigger>
          <TabsTrigger value="notifications" className="text-[11px] sm:text-sm px-1 sm:px-3"><Bell className="w-4 h-4 mr-2 hidden sm:inline" />Alerts</TabsTrigger>
          <TabsTrigger value="appearance" className="text-[11px] sm:text-sm px-1 sm:px-3"><Palette className="w-4 h-4 mr-2 hidden sm:inline" />Theme</TabsTrigger>
          <TabsTrigger value="security" className="text-[11px] sm:text-sm px-1 sm:px-3"><Shield className="w-4 h-4 mr-2 hidden sm:inline" />Security</TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Business Information</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Business Name</Label>
                  <Input 
                    value={businessInfo.name} 
                    onChange={(e) => setBusinessInfo({...businessInfo, name: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Registration Email</Label>
                  <Input 
                    value={businessInfo.email} 
                    onChange={(e) => setBusinessInfo({...businessInfo, email: e.target.value})} 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Business Address</Label>
                <Input 
                  value={businessInfo.address} 
                  onChange={(e) => setBusinessInfo({...businessInfo, address: e.target.value})} 
                />
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <Button onClick={handleUpdateBusiness} className="bg-gradient-to-r from-indigo-600 to-purple-600">
              <Save className="w-4 h-4 mr-2" />Save Changes
            </Button>
          </div>
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team" className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-[#FF6B00]" />Team Management</CardTitle>
                <CardDescription>Accounts linked to {savedUser.user_name}</CardDescription>
              </div>
              <Button onClick={() => setIsAddMemberOpen(true)} className="bg-[#FF6B00]"><UserPlus className="w-4 h-4 mr-2" />Add Staff</Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamMembers.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.fullName}</TableCell>
                      <TableCell>{m.email}</TableCell>
                      <TableCell><Badge className={getRoleBadgeColor(m.role)}>{m.role}</Badge></TableCell>
                      <TableCell>{m.createdAt}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleEditClick(m)}
                          >
                            <Pencil className="w-4 h-4 text-blue-500" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleDeleteStaffClick(m)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Data Tab */}
        <TabsContent value="data" className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-[#FF6B00]" />
                  Forecast Configuration
                </CardTitle>
                <CardDescription>
                  Control how forecasts are generated when new sales data is imported.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 p-4 rounded-lg border bg-muted/30">
                <div className="space-y-1">
                  <Label className="text-sm font-semibold">Auto-Run All Forecasts on Import</Label>
                  <p className="text-xs text-muted-foreground">
                    When enabled, importing a sales report will automatically run forecasts for all products.
                    When disabled, you must manually run each product forecast in the Predictions & Trends module.
                  </p>
                </div>
                <Switch
                  checked={autoRunForecast}
                  onCheckedChange={handleAutoRunForecastChange}
                />
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-md bg-amber-50 border border-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <span>
                  Auto-running forecasts for all products may take some time depending on the number of products.
                  Each product requires a minimum of 12 months of sales data for accurate forecasting.
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader><CardTitle>Alert Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <Label>Low Stock Alerts</Label>
                <Switch checked={lowStockAlerts} onCheckedChange={setLowStockAlerts} />
              </div>
              <div className="flex justify-between items-center">
                <Label>Email Digest</Label>
                <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance" className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader><CardTitle>Visual Preferences</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Label>Theme Mode</Label>
              <Select defaultValue="light" onValueChange={(value) => toggleTheme(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light Mode</SelectItem>
                  <SelectItem value="dark">Dark Mode</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader><CardTitle>Access Control</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Current Password</Label>
                  <Input 
                    type="password" 
                    placeholder="Type old password" 
                    value={passwords.old} 
                    onChange={(e) => setPasswords({...passwords, old: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input 
                    type="password" 
                    placeholder="New Password" 
                    value={passwords.new} 
                    onChange={(e) => setPasswords({...passwords, new: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Confirm New Password</Label>
                  <Input 
                    type="password" 
                    placeholder="Confirm New Password" 
                    value={passwords.confirm} 
                    onChange={(e) => setPasswords({...passwords, confirm: e.target.value})} 
                  />
                </div>
                <Button onClick={handleChangePassword} className="w-full" variant="outline">
                  Update Credentials
                </Button>
              <Separator />
              <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                <p className="text-red-600 text-sm font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Danger Zone
                </p>
                <p className="text-xs text-red-500 mt-1">Permanently remove your business and all associated data.</p>
                <Button 
                  variant="destructive" 
                  className="mt-4 w-full" 
                  onClick={() => setIsDeleteAccountOpen(true)}
                >
                  Delete Business Account
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Auto-run forecast confirmation dialog */}
      <Dialog open={isAutoRunConfirmOpen} onOpenChange={handleAutoRunDialogChange}>
        <DialogContent
          onInteractOutside={(event) => {
            if (isVerifyingAutoRun) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (isVerifyingAutoRun) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-[#FF6B00]" />
              Enable Automatic Forecasting
            </DialogTitle>
            <DialogDescription>
              This will automatically run forecasts for every eligible product after a sales report is imported.
              It may take time and use additional server resources. Confirm the current business account to continue.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              Auto-Run is currently OFF. It will only be enabled after successful verification.
            </div>

            <div className="space-y-2">
              <Label htmlFor="auto-run-account-name">
                Type <strong>{businessInfo.name || "the current business name"}</strong> to confirm
              </Label>
              <Input
                id="auto-run-account-name"
                placeholder="Business Name"
                value={autoRunAccountName}
                onChange={(event) => {
                  setAutoRunAccountName(event.target.value);
                  setAutoRunConfirmError("");
                }}
                disabled={isVerifyingAutoRun}
                autoComplete="organization"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="auto-run-password">Current account password</Label>
              <Input
                id="auto-run-password"
                type="password"
                placeholder="Password"
                value={autoRunPassword}
                onChange={(event) => {
                  setAutoRunPassword(event.target.value);
                  setAutoRunConfirmError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && autoRunAccountName && autoRunPassword && !isVerifyingAutoRun) {
                    void handleConfirmAutoRun();
                  }
                }}
                disabled={isVerifyingAutoRun}
                autoComplete="current-password"
              />
            </div>

            {autoRunConfirmError && (
              <p role="alert" className="flex items-start gap-2 text-sm font-medium text-red-500">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {autoRunConfirmError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleAutoRunDialogChange(false)}
              disabled={isVerifyingAutoRun}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleConfirmAutoRun()}
              disabled={!autoRunAccountName.trim() || !autoRunPassword || isVerifyingAutoRun}
              className="bg-[#FF6B00] text-white hover:bg-[#E55F00]"
            >
              {isVerifyingAutoRun ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Enable Auto-Run"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Staff Dialog */}
      <Dialog open={isAddMemberOpen} onOpenChange={(open) => {
        setIsAddMemberOpen(open);
        if (!open) {
          setNewMemberConfirmPassword("");
          setEmailCheckResult({ loading: false, exists: null });
          setNameCheckResult({ loading: false, exists: null });
          setAddStaffError("");
        }
      }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Team Member</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Full Name</Label>
              <Input placeholder="Full Name" value={newMemberFullName} onChange={(e) => setNewMemberFullName(e.target.value)} />
              {newMemberFullName.trim() && (
                nameCheckResult.loading ? (
                  <p className="text-xs text-muted-foreground">Checking availability...</p>
                ) : nameCheckResult.exists ? (
                  <p className="text-xs text-red-500 font-medium">A staff member with this name already exists in the system.</p>
                ) : (
                  <p className="text-xs text-green-600 font-medium">Name is available.</p>
                )
              )}
            </div>
            
            <div className="space-y-1">
              <Label>Email Address</Label>
              <Input placeholder="Email" value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)} />
              {newMemberEmail.trim() && (
                emailCheckResult.loading ? (
                  <p className="text-xs text-muted-foreground">Checking availability...</p>
                ) : emailCheckResult.exists ? (
                  <p className="text-xs text-red-500 font-medium">This email is already registered in the system.</p>
                ) : (
                  <p className="text-xs text-green-600 font-medium">Email is available.</p>
                )
              )}
            </div>

            <div className="space-y-1">
              <Label>Password</Label>
              <Input type="password" placeholder="Password" value={newMemberPassword} onChange={(e) => setNewMemberPassword(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>Confirm Password</Label>
              <Input type="password" placeholder="Confirm Password" value={newMemberConfirmPassword} onChange={(e) => setNewMemberConfirmPassword(e.target.value)} />
              {newMemberConfirmPassword && newMemberPassword !== newMemberConfirmPassword && (
                <p className="text-xs text-red-500 font-medium">Passwords do not match.</p>
              )}
            </div>

            {addStaffError && (
              <p className="text-sm text-red-500 text-center font-medium mt-2">{addStaffError}</p>
            )}
          </div>
          <DialogFooter>
            <Button 
              onClick={handleAddTeamMember} 
              className="bg-[#FF6B00]"
              disabled={
                nameCheckResult.loading || 
                nameCheckResult.exists === true || 
                emailCheckResult.loading || 
                emailCheckResult.exists === true
              }
            >
              Create Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Staff Dialog */}
      <Dialog open={isEditMemberOpen} onOpenChange={(open) => {
        setIsEditMemberOpen(open);
        if (!open) {
          setEditEmailCheckResult({ loading: false, exists: null });
          setEditNameCheckResult({ loading: false, exists: null });
          setEditStaffError("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-blue-500" />
              Edit Team Member
            </DialogTitle>
            <DialogDescription>
              Update the name or email for this staff account.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input 
                value={editingMember?.fullName || ""} 
                onChange={(e) => setEditingMember(prev => prev ? {...prev, fullName: e.target.value} : null)} 
              />
              {editingMember?.fullName.trim() && (
                editNameCheckResult.loading ? (
                  <p className="text-xs text-muted-foreground">Checking availability...</p>
                ) : editNameCheckResult.exists ? (
                  <p className="text-xs text-red-500 font-medium">A staff member with this name already exists in the system.</p>
                ) : (
                  <p className="text-xs text-green-600 font-medium">Name is available.</p>
                )
              )}
            </div>
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input 
                value={editingMember?.email || ""} 
                onChange={(e) => setEditingMember(prev => prev ? {...prev, email: e.target.value} : null)} 
              />
              {editingMember?.email.trim() && (
                editEmailCheckResult.loading ? (
                  <p className="text-xs text-muted-foreground">Checking availability...</p>
                ) : editEmailCheckResult.exists ? (
                  <p className="text-xs text-red-500 font-medium">This email is already registered in the system.</p>
                ) : (
                  <p className="text-xs text-green-600 font-medium">Email is available.</p>
                )
              )}
            </div>

            {editStaffError && (
              <p className="text-sm text-red-500 text-center font-medium mt-2">{editStaffError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditMemberOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleUpdateStaff} 
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={
                editNameCheckResult.loading || 
                editNameCheckResult.exists === true || 
                editEmailCheckResult.loading || 
                editEmailCheckResult.exists === true
              }
            >
              Update Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Account Dialog */}
      <Dialog open={isDeleteAccountOpen} onOpenChange={setIsDeleteAccountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Delete Business Account
            </DialogTitle>
            <DialogDescription className="text-red-500 font-medium">
              WARNING: This will permanently delete your business, sales data, prediction artifacts, and all associated data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm">Please type <strong>{businessInfo.name}</strong> to confirm.</p>
            <Input 
              placeholder="Business Name" 
              value={deleteAccountName} 
              onChange={(e) => setDeleteAccountName(e.target.value)} 
            />
            <p className="text-sm mt-4">Please enter your password.</p>
            <Input 
              type="password" 
              placeholder="Password" 
              value={deleteAccountPassword} 
              onChange={(e) => setDeleteAccountPassword(e.target.value)} 
            />
            {deleteAccountError && <p className="text-red-500 text-sm font-medium">{deleteAccountError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsDeleteAccountOpen(false);
              setDeleteAccountError("");
              setDeleteAccountName("");
              setDeleteAccountPassword("");
            }}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteAccount}
              disabled={!deleteAccountName || !deleteAccountPassword}
              className="transition-opacity duration-300 disabled:opacity-50"
            >
              Permanently Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Staff Dialog */}
      <Dialog open={isDeleteStaffOpen} onOpenChange={setIsDeleteStaffOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Delete Staff Account
            </DialogTitle>
            <DialogDescription className="text-red-500 font-medium">
              WARNING: This will permanently delete the staff account for {deletingStaffMember?.fullName}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm">Please type <strong>{businessInfo.name}</strong> to confirm.</p>
            <Input 
              placeholder="Business Name" 
              value={deleteStaffConfirmBusinessName} 
              onChange={(e) => setDeleteStaffConfirmBusinessName(e.target.value)} 
            />
            <p className="text-sm mt-4">Please enter your business account password.</p>
            <Input 
              type="password" 
              placeholder="Business Password" 
              value={deleteStaffPassword} 
              onChange={(e) => setDeleteStaffPassword(e.target.value)} 
            />
            {deleteStaffError && <p className="text-red-500 text-sm font-medium">{deleteStaffError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsDeleteStaffOpen(false);
              setDeleteStaffError("");
              setDeleteStaffConfirmBusinessName("");
              setDeleteStaffPassword("");
              setDeletingStaffMember(null);
            }}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleConfirmDeleteStaff}
              disabled={!deleteStaffConfirmBusinessName || !deleteStaffPassword}
              className="transition-opacity duration-300 disabled:opacity-50"
            >
              Permanently Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
